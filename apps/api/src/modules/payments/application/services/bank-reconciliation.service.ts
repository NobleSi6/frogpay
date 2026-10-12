import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

export interface ReconcileDepositInput {
  tenantId: string;
  depositId?: string;
  reference: string;
  amount: string;
  currency: string;
  bankName: string;
}

export type ReconciliationStatus = 'reconciled' | 'amount_mismatch' | 'unmatched';

export interface ReconcileDepositResult {
  status: ReconciliationStatus;
  depositId: string;
  paymentId?: string;
  errorCode?: string;
}

@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger(BankReconciliationService.name);

  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  async reconcile(input: ReconcileDepositInput): Promise<ReconcileDepositResult> {
    const { tenantId, reference, bankName } = input;
    const depositAmount = parseFloat(input.amount);

    return this.tenantContext.withTenant(tenantId, async (tx) => {
      // 1. Idempotencia: Verificar si ya existe un depósito con este external_id para el tenant
      if (input.depositId) {
        const existingTx = await tx.bank_transaction.findFirst({
          where: {
            tenant_id: tenantId,
            external_id: input.depositId,
          },
        });

        if (existingTx) {
          this.logger.log(
            `Depósito idempotente repetido: ${input.depositId} (Estado: ${existingTx.status})`,
          );
          return {
            status: existingTx.status as ReconciliationStatus,
            depositId: existingTx.id,
            paymentId: existingTx.payment_id ?? undefined,
            errorCode:
              existingTx.status === 'amount_mismatch'
                ? 'amount_mismatch'
                : existingTx.status === 'unmatched'
                  ? 'reference_not_found'
                  : undefined,
          };
        }
      }

      // 2. Buscar el pago asociado por referencia (provider_transaction_id)
      const payment = await tx.payment.findFirst({
        where: {
          tenant_id: tenantId,
          provider_transaction_id: reference,
        },
        include: {
          tenant: {
            include: { plan: true },
          },
        },
      });

      // CASO A: Referencia no encontrada
      if (!payment) {
        this.logger.warn(
          `Depósito no conciliado: referencia no encontrada "${reference}" (Tenant: ${tenantId})`,
        );

        const createdTx = await tx.bank_transaction.create({
          data: {
            tenant_id: tenantId,
            external_id: input.depositId ?? null,
            reference,
            amount: input.amount,
            currency: input.currency,
            bank_name: bankName,
            status: 'unmatched',
            payment_id: null,
            metadata: { reason: 'reference_not_found' },
          },
        });

        return {
          status: 'unmatched',
          depositId: createdTx.id,
          errorCode: 'reference_not_found',
        };
      }

      // CASO B: El pago ya no está en estado 'pending'
      if (payment.status !== 'pending') {
        this.logger.warn(
          `Transición inválida: pago ${payment.id} se encuentra en estado "${payment.status}"`,
        );

        await tx.bank_transaction.create({
          data: {
            tenant_id: tenantId,
            external_id: input.depositId ?? null,
            reference,
            amount: input.amount,
            currency: input.currency,
            bank_name: bankName,
            status: 'unmatched',
            payment_id: payment.id,
            metadata: {
              reason: 'invalid_state_transition',
              currentPaymentStatus: payment.status,
            },
          },
        });

        throw new UnprocessableEntityException({
          code: 'invalid_state_transition',
          message: `El pago con referencia "${reference}" ya no se encuentra en estado pending (estado actual: ${payment.status}).`,
        });
      }

      const expectedAmount = Number(payment.amount);
      const isAmountMatch = Math.abs(depositAmount - expectedAmount) < 0.001;

      // CASO C: La referencia existe pero el monto es diferente
      if (!isAmountMatch) {
        this.logger.warn(
          `Monto discrepante para pago ${payment.id}: esperado ${expectedAmount}, recibido ${depositAmount}`,
        );

        // Actualizar pago a 'rejected' con amount_mismatch
        await tx.payment.update({
          where: {
            id_tenant_id: {
              id: payment.id,
              tenant_id: tenantId,
            },
          },
          data: {
            status: 'rejected',
            error_code: 'amount_mismatch',
            updated_at: new Date(),
          },
        });

        // Registrar historial
        await tx.payment_status_history.create({
          data: {
            payment_id: payment.id,
            tenant_id: tenantId,
            previous_status: 'pending',
            new_status: 'rejected',
            metadata: {
              errorCode: 'amount_mismatch',
              expectedAmount: String(payment.amount),
              receivedAmount: input.amount,
            },
          },
        });

        // Registrar transacción bancaria
        const createdTx = await tx.bank_transaction.create({
          data: {
            tenant_id: tenantId,
            external_id: input.depositId ?? null,
            reference,
            amount: input.amount,
            currency: input.currency,
            bank_name: bankName,
            status: 'amount_mismatch',
            payment_id: payment.id,
            metadata: {
              errorCode: 'amount_mismatch',
              expectedAmount: String(payment.amount),
              receivedAmount: input.amount,
            },
          },
        });

        // Outbox: pago.rechazado
        await tx.domain_event_outbox.create({
          data: {
            aggregate_type: 'payment',
            aggregate_id: payment.id,
            tenant_id: tenantId,
            event_type: 'pago.rechazado',
            payload: {
              paymentId: payment.id,
              amount: String(payment.amount),
              currency: payment.currency,
              paymentMethod: 'bank_transfer',
              environment: payment.environment,
              merchantReference: payment.merchant_reference,
              errorCode: 'amount_mismatch',
              receivedAmount: input.amount,
            },
          },
        });

        return {
          status: 'amount_mismatch',
          depositId: createdTx.id,
          paymentId: payment.id,
          errorCode: 'amount_mismatch',
        };
      }

      // CASO D: Conciliación exitosa (monto y referencia coinciden)
      const plan = payment.tenant.plan;
      const commFixed = plan ? Number(plan.commission_fixed) : 0;
      const commPct = plan ? Number(plan.commission_pct) : 0;
      const calculatedCommission = Number((expectedAmount * commPct + commFixed).toFixed(2));
      const calculatedNet = Number((expectedAmount - calculatedCommission).toFixed(2));

      // Actualizar pago a 'approved'
      await tx.payment.update({
        where: {
          id_tenant_id: {
            id: payment.id,
            tenant_id: tenantId,
          },
        },
        data: {
          status: 'approved',
          commission_amount: calculatedCommission.toFixed(2),
          net_amount: calculatedNet.toFixed(2),
          error_code: null,
          updated_at: new Date(),
        },
      });

      // Actualizar consumo del plan
      const currentPeriod = new Date().toISOString().slice(0, 7);
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
          volume_used: expectedAmount,
          tx_count: 1,
        },
        update: {
          volume_used: { increment: expectedAmount },
          tx_count: { increment: 1 },
        },
      });

      // Registrar historial
      await tx.payment_status_history.create({
        data: {
          payment_id: payment.id,
          tenant_id: tenantId,
          previous_status: 'pending',
          new_status: 'approved',
          metadata: {
            reconciledBy: 'automatic_bank_deposit',
            bankName,
          },
        },
      });

      // Registrar transacción bancaria conciliada
      const createdTx = await tx.bank_transaction.create({
        data: {
          tenant_id: tenantId,
          external_id: input.depositId ?? null,
          reference,
          amount: input.amount,
          currency: input.currency,
          bank_name: bankName,
          status: 'reconciled',
          payment_id: payment.id,
          metadata: {
            reconciledAt: new Date().toISOString(),
          },
        },
      });

      // Outbox: pago.aprobado
      await tx.domain_event_outbox.create({
        data: {
          aggregate_type: 'payment',
          aggregate_id: payment.id,
          tenant_id: tenantId,
          event_type: 'pago.aprobado',
          payload: {
            paymentId: payment.id,
            amount: String(payment.amount),
            currency: payment.currency,
            paymentMethod: 'bank_transfer',
            environment: payment.environment,
            merchantReference: payment.merchant_reference,
            commissionAmount: calculatedCommission.toFixed(2),
            netAmount: calculatedNet.toFixed(2),
            providerTransactionId: payment.provider_transaction_id,
          },
        },
      });

      this.logger.log(
        `Pago ${payment.id} conciliado exitosamente con depósito ${createdTx.id}`,
      );

      return {
        status: 'reconciled',
        depositId: createdTx.id,
        paymentId: payment.id,
      };
    });
  }
}
