import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaTenantContextService } from '../../shared/database/prisma-tenant-context.service';
import { MetricsService } from './metrics.service';

const OUTBOX_METRICS_INTERVAL_MS = 15_000;

@Injectable()
export class OutboxMetricsCollector
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxMetricsCollector.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly database: PrismaTenantContextService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    void this.collect();
    this.timer = setInterval(
      () => void this.collect(),
      OUTBOX_METRICS_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async collect(): Promise<void> {
    try {
      const pending = await this.database.withGlobalAccess(
        async (transaction) => {
          const [count, oldest] = await Promise.all([
            transaction.domain_event_outbox.count({
              where: { status: 'pending' },
            }),
            transaction.domain_event_outbox.findFirst({
              where: { status: 'pending' },
              orderBy: { created_at: 'asc' },
              select: { created_at: true },
            }),
          ]);

          return {
            count,
            oldestCreatedAt: oldest?.created_at ?? null,
          };
        },
      );

      const oldestPendingAgeSeconds = pending.oldestCreatedAt
        ? Math.max(
            0,
            (Date.now() - pending.oldestCreatedAt.getTime()) / 1000,
          )
        : 0;

      this.metrics.setOutboxPending(
        pending.count,
        oldestPendingAgeSeconds,
      );
    } catch (error) {
      this.metrics.setOutboxMetricsUnavailable();
      this.logger.warn(
        `No se pudieron actualizar las métricas del outbox: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
}
