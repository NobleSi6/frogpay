import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookDispatchQueue } from '../../infrastructure/messaging/webhook-dispatch.queue';
import { WebhookDeliveryRepository } from '../../infrastructure/persistence/webhook-delivery.repository';
import { DeliverWebhookUseCase } from '../use-cases/deliver-webhook.use-case';

const SWEEP_INTERVAL_MS = 30_000;
const STUCK_GRACE_MS = 60_000;
const SWEEP_BATCH = 50;

/**
 * Arranca el consumidor de entregas y un barrido periódico que recupera
 * entregas pendientes cuyo mensaje se perdió (reinicio del proceso, caída de
 * RabbitMQ entre el commit y el encolado). Así no se pierden reintentos.
 */
@Injectable()
export class WebhookDeliveryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly queue: WebhookDispatchQueue,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly deliver: DeliverWebhookUseCase,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('WEBHOOK_WORKER_ENABLED') === 'false') {
      this.logger.warn('Worker de webhooks deshabilitado (WEBHOOK_WORKER_ENABLED=false).');
      return;
    }
    void this.queue
      .consume(async (message) => {
        await this.deliver.execute(message);
      })
      .catch((error: unknown) =>
        this.logger.warn(`RabbitMQ no disponible para webhooks; se reintentará: ${error instanceof Error ? error.message : error}`),
      );
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    let recovered = 0;
    try {
      await this.queue.ensureConnected();
      const stuck = await this.deliveries.findStuckDeliveries(new Date(Date.now() - STUCK_GRACE_MS), SWEEP_BATCH);
      for (const item of stuck) {
        if (await this.deliveries.touchForRecovery(item.id, item.attemptCount)) {
          await this.queue.enqueue({ deliveryId: item.id, attempt: item.attemptCount + 1 });
          recovered += 1;
        }
      }
      if (recovered > 0) this.logger.warn(`Barrido de webhooks: ${recovered} entrega(s) recuperada(s)`);
    } catch (error) {
      this.logger.warn(`Barrido de webhooks omitido: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.sweeping = false;
    }
    return recovered;
  }
}
