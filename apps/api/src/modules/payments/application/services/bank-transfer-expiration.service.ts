import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

@Injectable()
export class BankTransferExpirationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BankTransferExpirationService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const checkIntervalMs = this.config.get<number>(
      'BANK_EXPIRATION_CHECK_INTERVAL_MS',
      60000,
    );
    this.timer = setInterval(() => {
      this.expirePendingTransfers().catch((err) => {
        this.logger.error('Error expirando transferencias pendientes:', err);
      });
    }, checkIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async expirePendingTransfers(now: Date = new Date()): Promise<number> {
    const expiredPayments = await this.tenantContext.withGlobalAccess(async (tx) => {
      return tx.payment.findMany({
        where: {
          status: 'pending',
          expires_at: {
            lte: now,
          },
          provider: {
            payment_method: {
              code: 'bank_transfer',
            },
          },
        },
        select: {
          id: true,
          tenant_id: true,
          amount: true,
          currency: true,
          environment: true,
          merchant_reference: true,
        },
      });
    });

    if (expiredPayments.length === 0) {
      return 0;
    }

    this.logger.log(
      `Expirando ${expiredPayments.length} pagos por transferencia vencidos...`,
    );

    let expiredCount = 0;
    for (const payment of expiredPayments) {
      try {
        await this.tenantContext.withTenant(payment.tenant_id, async (tx) => {
          const current = await tx.payment.findUnique({
            where: {
              id_tenant_id: {
                id: payment.id,
                tenant_id: payment.tenant_id,
              },
            },
          });

          if (!current || current.status !== 'pending') {
            return;
          }

          // Actualizar a rejected con transfer_expired
          await tx.payment.update({
            where: {
              id_tenant_id: {
                id: payment.id,
                tenant_id: payment.tenant_id,
              },
            },
            data: {
              status: 'rejected',
              error_code: 'transfer_expired',
              updated_at: new Date(),
            },
          });

          // Historial de estados
          await tx.payment_status_history.create({
            data: {
              payment_id: payment.id,
              tenant_id: payment.tenant_id,
              previous_status: 'pending',
              new_status: 'rejected',
              metadata: {
                errorCode: 'transfer_expired',
                expiredAt: now.toISOString(),
              },
            },
          });

          // Evento outbox: pago.rechazado
          await tx.domain_event_outbox.create({
            data: {
              aggregate_type: 'payment',
              aggregate_id: payment.id,
              tenant_id: payment.tenant_id,
              event_type: 'pago.rechazado',
              payload: {
                paymentId: payment.id,
                amount: String(payment.amount),
                currency: payment.currency,
                paymentMethod: 'bank_transfer',
                environment: payment.environment,
                merchantReference: payment.merchant_reference,
                errorCode: 'transfer_expired',
              },
            },
          });
        });
        expiredCount++;
      } catch (err) {
        this.logger.error(`Error expirando pago ${payment.id}:`, err);
      }
    }

    return expiredCount;
  }
}
