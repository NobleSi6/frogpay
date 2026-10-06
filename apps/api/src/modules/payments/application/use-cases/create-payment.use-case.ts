import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';
import {
  PAYMENT_PROVIDER_PORT,
  PaymentProviderPort,
  ProcessPaymentResult,
} from '../../../provider-adapters/ports/payment-provider.port';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { PaymentResponseDto, PaymentStatus } from '../dto/payment-response.dto';

export interface CreatePaymentExecutionResult {
  isReplay: boolean;
  response: PaymentResponseDto;
}

@Injectable()
export class CreatePaymentUseCase {
  private readonly logger = new Logger(CreatePaymentUseCase.name);

  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    private readonly idempotency: IdempotencyService,
    @Inject(PAYMENT_PROVIDER_PORT)
    private readonly paymentProvider: PaymentProviderPort,
  ) {}

  async execute(
    tenantId: string,
    environment: 'sandbox' | 'production',
    idempotencyKey: string,
    dto: CreatePaymentDto,
  ): Promise<CreatePaymentExecutionResult> {
    const bodyHash = this.idempotency.computeCanonicalBodyHash(dto);

    // 1. Reclamar clave de idempotencia atómicamente en Redis
    const lockResult = await this.idempotency.acquireLock(
      tenantId,
      environment,
      idempotencyKey,
      bodyHash,
    );

    if (lockResult.isReplay) {
      this.logger.log(
        `Reintento idempotente exitoso para clave: ${idempotencyKey} (Tenant: ${tenantId})`,
      );
      return { isReplay: true, response: lockResult.response };
    }

    try {
      // 2. Transacción 1 (Local): Validar plan, registrar pago en 'pending' y outbox 'pago.creado'
      const { paymentId, providerId, paymentMethodId, commissionAmount, netAmount } =
        await this.tenantContext.withTenant(tenantId, async (tx) => {
          // Verificar tenant y plan
          const tenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            include: { plan: true },
          });

          if (!tenant) {
            throw new NotFoundException(`No se encontró el tenant con ID: ${tenantId}`);
          }

          // Verificar límites del plan (RF-20)
          const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
          const plan = tenant.plan;
          const usage = await tx.tenant_plan_usage.findUnique({
            where: {
              tenant_id_period: {
                tenant_id: tenantId,
                period: currentPeriod,
              },
            },
          });

          const currentVolume = usage ? Number(usage.volume_used) : 0;
          const requestedAmount = parseFloat(dto.amount);

          if (plan?.monthly_volume_limit) {
            const limit = Number(plan.monthly_volume_limit);
            if (currentVolume + requestedAmount > limit) {
              throw new HttpException(
                {
                  code: 'plan_limit_exceeded',
                  message: 'El tenant superó el límite de volumen de su plan.',
                  details: { currentVolume, limit, requestedAmount },
                },
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }
          }

          // Calcular comisión según el plan
          const commFixed = plan ? Number(plan.commission_fixed) : 0;
          const commPct = plan ? Number(plan.commission_pct) : 0;
          const calculatedCommission = Number(
            (requestedAmount * commPct + commFixed).toFixed(2),
          );
          const calculatedNet = Number((requestedAmount - calculatedCommission).toFixed(2));

          // Obtener método de pago y proveedor
          const paymentMethod = await tx.payment_method.findUnique({
            where: { code: dto.paymentMethod },
          });

          if (!paymentMethod) {
            throw new NotFoundException(`Método de pago '${dto.paymentMethod}' no encontrado.`);
          }

          const provider = await tx.provider.findFirst({
            where: { payment_method_id: paymentMethod.id, is_active: true },
          });

          if (!provider) {
            throw new NotFoundException(
              `No hay proveedor activo para el método '${dto.paymentMethod}'.`,
            );
          }

          // Insertar pago en 'pending'
          const payment = await tx.payment.create({
            data: {
              tenant_id: tenantId,
              idempotency_key: idempotencyKey,
              idempotency_body_hash: bodyHash,
              amount: dto.amount,
              currency: dto.currency,
              status: 'pending',
              payment_method_id: paymentMethod.id,
              provider_id: provider.id,
              environment,
              merchant_reference: dto.merchantReference,
            },
          });

          // Insertar historial de estado inicial
          await tx.payment_status_history.create({
            data: {
              payment_id: payment.id,
              tenant_id: tenantId,
              previous_status: null,
              new_status: 'pending',
              metadata: {},
            },
          });

          // Insertar evento outbox: pago.creado
          await tx.domain_event_outbox.create({
            data: {
              aggregate_type: 'payment',
              aggregate_id: payment.id,
              tenant_id: tenantId,
              event_type: 'pago.creado',
              payload: {
                paymentId: payment.id,
                amount: dto.amount,
                currency: dto.currency,
                paymentMethod: dto.paymentMethod,
                environment,
                merchantReference: dto.merchantReference,
              },
            },
          });

          return {
            paymentId: payment.id,
            providerId: provider.id,
            paymentMethodId: paymentMethod.id,
            commissionAmount: calculatedCommission.toFixed(2),
            netAmount: calculatedNet.toFixed(2),
          };
        });

      // 3. Llamada al proveedor externo (Fuera de la transacción de BD)
      let providerResult: ProcessPaymentResult;
      try {
        providerResult = await this.paymentProvider.processPayment({
          tenantId,
          environment,
          amount: dto.amount,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          merchantReference: dto.merchantReference,
          paymentToken: dto.paymentToken,
          idempotencyKey,
        });
      } catch (error) {
        this.logger.error(`Error o timeout llamando al proveedor de pago:`, error);
        providerResult = {
          status: 'failed',
          errorCode: 'provider_timeout',
        };
      }

      // 4. Transacción 2 (Local): Actualizar pago, historial, outbox final y consumo de plan
      const finalStatus: PaymentStatus = providerResult.status;
      const isApproved = finalStatus === 'approved';

      const updatedPayment = await this.tenantContext.withTenant(tenantId, async (tx) => {
        const payment = await tx.payment.update({
          where: {
            id_tenant_id: {
              id: paymentId,
              tenant_id: tenantId,
            },
          },
          data: {
            status: finalStatus,
            provider_transaction_id: providerResult.providerTransactionId ?? null,
            error_code: providerResult.errorCode ?? null,
            commission_amount: isApproved ? commissionAmount : null,
            net_amount: isApproved ? netAmount : null,
            updated_at: new Date(),
          },
        });

        // Historial de cambio de estado
        await tx.payment_status_history.create({
          data: {
            payment_id: paymentId,
            tenant_id: tenantId,
            previous_status: 'pending',
            new_status: finalStatus,
            metadata: providerResult.errorCode ? { errorCode: providerResult.errorCode } : {},
          },
        });

        // Registrar evento de outbox según el resultado final
        let outboxEventType = 'pago.aprobado';
        let outboxPayload: Record<string, unknown>;

        if (isApproved) {
          outboxEventType = 'pago.aprobado';
          outboxPayload = {
            paymentId,
            amount: dto.amount,
            currency: dto.currency,
            paymentMethod: dto.paymentMethod,
            environment,
            merchantReference: dto.merchantReference,
            commissionAmount,
            netAmount,
            providerTransactionId: providerResult.providerTransactionId,
          };

          // Actualizar consumo de plan (tenant_plan_usage)
          const currentPeriod = new Date().toISOString().slice(0, 7);
          const requestedAmount = parseFloat(dto.amount);

          await tx.tenant_plan_usage.upsert({
            where: {
              tenant_id_period: {
                tenant_id: tenantId,
                period: currentPeriod,
              },
            },
            create: {
              tenant_id: tenantId,
              period: currentPeriod,
              volume_used: requestedAmount,
              tx_count: 1,
            },
            update: {
              volume_used: { increment: requestedAmount },
              tx_count: { increment: 1 },
            },
          });
        } else if (finalStatus === 'rejected') {
          outboxEventType = 'pago.rechazado';
          outboxPayload = {
            paymentId,
            amount: dto.amount,
            currency: dto.currency,
            paymentMethod: dto.paymentMethod,
            environment,
            merchantReference: dto.merchantReference,
            errorCode: providerResult.errorCode ?? 'card_declined',
          };
        } else {
          outboxEventType = 'pago.fallido';
          outboxPayload = {
            paymentId,
            amount: dto.amount,
            currency: dto.currency,
            paymentMethod: dto.paymentMethod,
            environment,
            merchantReference: dto.merchantReference,
            errorCode: providerResult.errorCode ?? 'provider_timeout',
          };
        }

        await tx.domain_event_outbox.create({
          data: {
            aggregate_type: 'payment',
            aggregate_id: paymentId,
            tenant_id: tenantId,
            event_type: outboxEventType,
            payload: outboxPayload,
          },
        });

        return payment;
      });

      // 5. Construir respuesta final
      const paymentResponse: PaymentResponseDto = {
        id: updatedPayment.id,
        status: finalStatus,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethod: dto.paymentMethod,
        environment,
        merchantReference: dto.merchantReference,
        commissionAmount: isApproved ? commissionAmount : null,
        netAmount: isApproved ? netAmount : null,
        providerTransactionId: providerResult.providerTransactionId ?? null,
        errorCode: providerResult.errorCode ?? null,
        createdAt: updatedPayment.created_at.toISOString(),
        updatedAt: updatedPayment.updated_at.toISOString(),
      };

      // 6. Guardar en caché de idempotencia por 24 horas
      await this.idempotency.saveResult(
        tenantId,
        environment,
        idempotencyKey,
        bodyHash,
        paymentResponse,
      );

      return { isReplay: false, response: paymentResponse };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof HttpException
      ) {
        throw error;
      }

      await this.idempotency.releaseLock(tenantId, environment, idempotencyKey);
      throw error;
    }
  }
}
