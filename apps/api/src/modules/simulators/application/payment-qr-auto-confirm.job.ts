import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import { PaymentSettlementService } from '../../payments/application/use-cases/payment-settlement.service';

const BATCH_SIZE = 100;

@Injectable()
export class PaymentQrAutoConfirmJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentQrAutoConfirmJob.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    private readonly settlement: PaymentSettlementService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('qrAutoConfirmEnabled')) {
      this.logger.warn(
        'QR auto-confirm disabled (QR_AUTO_CONFIRM_ENABLED=false): timer will not start.',
      );
      return;
    }

    const intervalSeconds = this.config.getOrThrow<number>('qrAutoConfirmIntervalSeconds');
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(`No se pudieron consultar pagos QR para autoconfirmar: ${errorMessage(error)}`);
      });
    }, intervalSeconds * 1000);
    this.timer.unref?.();
    void this.runOnce().catch((error: unknown) => {
      this.logger.error(`No se pudieron consultar pagos QR para autoconfirmar: ${errorMessage(error)}`);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  runOnce(): Promise<void> {
    if (!this.config.get<boolean>('qrAutoConfirmEnabled')) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.approveMatureSandboxPayments().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async approveMatureSandboxPayments(): Promise<void> {
    const now = new Date();
    const matureBefore = new Date(
      now.getTime() - this.config.getOrThrow<number>('qrAutoConfirmSeconds') * 1000,
    );
    const eligiblePayments = await this.tenantContext.withGlobalAccess((tx) =>
      tx.payment.findMany({
        where: {
          status: 'pending',
          environment: 'sandbox',
          qr_payload: { not: null },
          created_at: { lte: matureBefore },
          expires_at: { gt: now },
          provider: {
            is: { payment_method: { is: { code: 'qr' } } },
          },
        },
        orderBy: { created_at: 'asc' },
        select: { id: true },
        take: BATCH_SIZE,
      }),
    );

    for (const payment of eligiblePayments) {
      try {
        await this.settlement.approve(payment.id);
      } catch (error) {
        this.logger.error(
          `No se pudo autoconfirmar el pago QR ${payment.id}: ${errorMessage(error)}`,
        );
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'error desconocido';
}
