import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { PaymentSettlementService } from './payment-settlement.service';

const BATCH_SIZE = 100;

@Injectable()
export class PaymentQrExpirationJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentQrExpirationJob.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    private readonly settlement: PaymentSettlementService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('qrExpirationJobEnabled')) {
      this.logger.warn(
        'QR expiration job disabled (QR_EXPIRATION_JOB_ENABLED=false): timer will not start.',
      );
      return;
    }

    const intervalSeconds = this.config.getOrThrow<number>('qrExpirationJobIntervalSeconds');
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(`No se pudieron consultar pagos QR vencidos: ${errorMessage(error)}`);
      });
    }, intervalSeconds * 1000);
    this.timer.unref?.();
    void this.runOnce().catch((error: unknown) => {
      this.logger.error(`No se pudieron consultar pagos QR vencidos: ${errorMessage(error)}`);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  runOnce(): Promise<void> {
    if (!this.config.get<boolean>('qrExpirationJobEnabled')) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.expirePendingPayments().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async expirePendingPayments(): Promise<void> {
    const expiredPayments = await this.tenantContext.withGlobalAccess((tx) =>
      tx.payment.findMany({
        where: {
          status: 'pending',
          expires_at: { lte: new Date() },
          provider: { payment_method: { code: 'qr' } },
        },
        orderBy: { expires_at: 'asc' },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    );

    for (const payment of expiredPayments) {
      try {
        await this.settlement.reject(payment.id, 'qr_expired');
      } catch (error) {
        this.logger.error(
          `No se pudo expirar el pago QR ${payment.id}: ${errorMessage(error)}`,
        );
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'error desconocido';
}
