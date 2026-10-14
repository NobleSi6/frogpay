import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderRetryQueue } from '../../infrastructure/messaging/provider-retry.queue';
import { RetryProviderAuthorizationUseCase } from '../use-cases/retry-provider-authorization.use-case';

const RECONNECT_INTERVAL_MS = 30_000;

/**
 * Arranca el consumidor de reintentos de pagos asíncronos (TSK-DEV2-305). Si
 * RabbitMQ no está disponible al iniciar, vuelve a intentar cada 30 s; los
 * mensajes son durables, así que ningún reintento se pierde.
 */
@Injectable()
export class ProviderRetryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProviderRetryWorker.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly queue: ProviderRetryQueue,
    private readonly retry: RetryProviderAuthorizationUseCase,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('PROVIDER_RETRY_WORKER_ENABLED') === 'false') {
      this.logger.warn('Worker de reintentos de pagos deshabilitado (PROVIDER_RETRY_WORKER_ENABLED=false).');
      return;
    }
    void this.queue
      .consume(async (message) => {
        await this.retry.execute(message);
      })
      .catch((error: unknown) =>
        this.logger.warn(`RabbitMQ no disponible para reintentos de pagos; se reintentará: ${error instanceof Error ? error.message : error}`),
      );
    this.timer = setInterval(() => {
      this.queue.ensureConnected().catch(() => undefined);
    }, RECONNECT_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
