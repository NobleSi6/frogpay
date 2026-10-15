import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PrismaTenantContextService,
  type TenantTx,
} from '../../../../shared/database/prisma-tenant-context.service';

export interface ReconcileDepositInput {
  tenantId: string;
  depositId?: string;
  reference: string;
  amount: string;
  currency: string;
  bankName: string;
}

export type ReconciliationStatus =
  'reconciled' | 'amount_mismatch' | 'currency_mismatch' | 'unmatched';

export interface ReconcileDepositResult {
  status: ReconciliationStatus;
  depositId: string;
  paymentId?: string;
  errorCode?: string;
}

interface ReconciliationOutcome {
  result: ReconcileDepositResult;
  currentState?: string;
}

@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger(BankReconciliationService.name);

  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  async reconcile(
    input: ReconcileDepositInput,
  ): Promise<ReconcileDepositResult> {
    const { tenantId, reference, bankName } = input;
    const depositAmount = parseFloat(input.amount);

    try {
      const outcome = await this.tenantContext.withTenant(
        tenantId,
        async (tx): Promise<ReconciliationOutcome> => {
          if (input.depositId) {
            const existingTx = await tx.bank_transaction.findFirst({
              where: {
                tenant_id: tenantId,
                external_id: input.depositId,
              },
            });

            if (existingTx) {
              this.assertSameDeposit(existingTx, input, depositAmount);
              this.logger.log(
                `Depósito idempotente repetido: ${input.depositId} (Estado: ${existingTx.status})`,
              );
              return { result: this.toResult(existingTx) };
            }
          }

          const payment = await tx.payment.findFirst({
            where: {
              tenant_id: tenantId,
              provider_transaction_id: reference,
              environment: 'sandbox',
              provider: {
                is: {
                  payment_method: { is: { code: 'bank_transfer' } },
                },
              },
            },
            include: {
              tenant: {
                include: { plan: true },
              },
            },
          });

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
              result: {
                status: 'unmatched',
                depositId: createdTx.id,
                errorCode: 'reference_not_found',
              },
            };
          }

          if (payment.status !== 'pending') {
            this.logger.warn(
              `Transición inválida: pago ${payment.id} se encuentra en estado "${payment.status}"`,
            );
            return this.recordInvalidTransition(
              tx,
              input,
              payment.id,
              payment.status,
            );
          }

          if (payment.currency !== input.currency) {
            const createdTx = await tx.bank_transaction.create({
              data: {
                tenant_id: tenantId,
                external_id: input.depositId ?? null,
                reference,
                amount: input.amount,
                currency: input.currency,
                bank_name: bankName,
                status: 'currency_mismatch',
                payment_id: payment.id,
                metadata: {
                  reason: 'currency_mismatch',
                  expectedCurrency: payment.currency,
                  receivedCurrency: input.currency,
                },
              },
            });

            return {
              result: {
                status: 'currency_mismatch',
                depositId: createdTx.id,
                paymentId: payment.id,
                errorCode: 'currency_mismatch',
              },
            };
          }

          const expectedAmount = Number(payment.amount);
          const isAmountMatch =
            Math.abs(depositAmount - expectedAmount) < 0.001;

          // CASO C: La referencia existe pero el monto es diferente
          if (!isAmountMatch) {
            this.logger.warn(
              `Monto discrepante para pago ${payment.id}: esperado ${expectedAmount}, recibido ${depositAmount}`,
            );

            // Actualizar pago a 'rejected' con amount_mismatch
            const paymentClaim = await tx.payment.updateMany({
              where: {
                id: payment.id,
                tenant_id: tenantId,
                provider_id: payment.provider_id,
                payment_method_id: payment.payment_method_id,
                status: 'pending',
                environment: 'sandbox',
              },
              data: {
                status: 'rejected',
                error_code: 'amount_mismatch',
                updated_at: new Date(),
              },
            });
            if (paymentClaim.count !== 1) {
              return this.recordInvalidTransition(
                tx,
                input,
                payment.id,
                'actualizado por otra solicitud',
              );
            }

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
              result: {
                status: 'amount_mismatch',
                depositId: createdTx.id,
                paymentId: payment.id,
                errorCode: 'amount_mismatch',
              },
            };
          }

          // CASO D: Conciliación exitosa (monto y referencia coinciden)
          const plan = payment.tenant.plan;
          const commFixed = plan ? Number(plan.commission_fixed) : 0;
          const commPct = plan ? Number(plan.commission_pct) : 0;
          const calculatedCommission = Number(
            (expectedAmount * commPct + commFixed).toFixed(2),
          );
          const calculatedNet = Number(
            (expectedAmount - calculatedCommission).toFixed(2),
          );

          // Actualizar pago a 'approved'
          const paymentClaim = await tx.payment.updateMany({
            where: {
              id: payment.id,
              tenant_id: tenantId,
              provider_id: payment.provider_id,
              payment_method_id: payment.payment_method_id,
              status: 'pending',
              environment: 'sandbox',
            },
            data: {
              status: 'approved',
              commission_amount: calculatedCommission.toFixed(2),
              net_amount: calculatedNet.toFixed(2),
              error_code: null,
              updated_at: new Date(),
            },
          });
          if (paymentClaim.count !== 1) {
            return this.recordInvalidTransition(
              tx,
              input,
              payment.id,
              'actualizado por otra solicitud',
            );
          }

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
            result: {
              status: 'reconciled',
              depositId: createdTx.id,
              paymentId: payment.id,
            },
          };
        },
      );

      if (outcome.currentState) {
        throw new UnprocessableEntityException({
          code: 'invalid_state_transition',
          message: `El pago con referencia "${reference}" ya no se encuentra en estado pending (estado actual: ${outcome.currentState}).`,
        });
      }

      return outcome.result;
    } catch (error) {
      if (input.depositId && isUniqueConstraintError(error)) {
        const existingTx = await this.tenantContext.withTenant(tenantId, (tx) =>
          tx.bank_transaction.findFirst({
            where: { tenant_id: tenantId, external_id: input.depositId },
          }),
        );
        if (existingTx) {
          this.assertSameDeposit(existingTx, input, depositAmount);
          return this.toResult(existingTx);
        }
      }
      throw error;
    }
  }

  private async recordInvalidTransition(
    tx: TenantTx,
    input: ReconcileDepositInput,
    paymentId: string,
    currentState: string,
  ) {
    const createdTx = await tx.bank_transaction.create({
      data: {
        tenant_id: input.tenantId,
        external_id: input.depositId ?? null,
        reference: input.reference,
        amount: input.amount,
        currency: input.currency,
        bank_name: input.bankName,
        status: 'unmatched',
        payment_id: paymentId,
        metadata: {
          reason: 'invalid_state_transition',
          currentPaymentStatus: currentState,
        },
      },
    });
    return {
      result: {
        status: 'unmatched' as const,
        depositId: createdTx.id,
        paymentId,
        errorCode: 'invalid_state_transition',
      },
      currentState,
    };
  }

  private assertSameDeposit(
    transaction: {
      reference: string;
      amount: number | string | { toString(): string };
      currency: string;
    },
    input: ReconcileDepositInput,
    depositAmount: number,
  ): void {
    if (
      transaction.reference !== input.reference ||
      Number(transaction.amount.toString()) !== depositAmount ||
      transaction.currency.trim() !== input.currency
    ) {
      throw new ConflictException({
        code: 'deposit_id_reused',
        message:
          'El identificador del depósito ya fue utilizado con otros datos.',
      });
    }
  }

  private toResult(transaction: {
    id: string;
    status: string;
    payment_id: string | null;
    metadata?: unknown;
  }): ReconcileDepositResult {
    const metadataReason =
      typeof transaction.metadata === 'object' &&
      transaction.metadata !== null &&
      'reason' in transaction.metadata
        ? transaction.metadata.reason
        : undefined;
    const errorCode =
      transaction.status === 'amount_mismatch'
        ? 'amount_mismatch'
        : transaction.status === 'currency_mismatch'
          ? 'currency_mismatch'
          : transaction.status === 'unmatched'
            ? metadataReason === 'invalid_state_transition'
              ? 'invalid_state_transition'
              : 'reference_not_found'
            : undefined;
    return {
      status: reconciliationStatusFromDatabase(transaction.status),
      depositId: transaction.id,
      paymentId: transaction.payment_id ?? undefined,
      errorCode,
    };
  }
}

function reconciliationStatusFromDatabase(status: string): ReconciliationStatus {
  switch (status) {
    case 'reconciled':
    case 'amount_mismatch':
    case 'currency_mismatch':
    case 'unmatched':
      return status;
    default:
      throw new Error(`Estado bancario no soportado: ${status}`);
  }
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
