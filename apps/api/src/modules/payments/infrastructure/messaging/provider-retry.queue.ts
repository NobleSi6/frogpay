import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MetricsService } from '../../../observability/metrics.service';
import {
  parseRetryDelays,
  ProviderRetryMessage,
  ProviderRetryScheduler,
} from '../../application/ports/provider-retry-scheduler.port';

/**
 * Topología de RabbitMQ para reintentar pagos asíncronos (TSK-DEV2-305):
 *
 *   frogpay.payments.provider-retry          cola de trabajo del worker
 *   frogpay.payments.provider-retry.<ms>     esperas con TTL que devuelven el mensaje a la cola de trabajo
 *   frogpay.payments.dlq                     pagos cuyos reintentos se agotaron
 */
export const PROVIDER_RETRY_QUEUE = 'frogpay.payments.provider-retry';
export const PAYMENTS_DLQ = 'frogpay.payments.dlq';
export const providerRetryWaitQueue = (delayMs: number): string => `${PROVIDER_RETRY_QUEUE}.${delayMs}`;

@Injectable()
export class ProviderRetryQueue implements ProviderRetryScheduler, OnModuleDestroy {
  private readonly logger = new Logger(ProviderRetryQueue.name);
  readonly delaysMs: number[];
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private connecting?: Promise<amqp.ConfirmChannel>;
  private handler?: (message: ProviderRetryMessage) => Promise<void>;
  private dlqMetricsTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.delaysMs = parseRetryDelays(config.get<string>('PROVIDER_RETRY_DELAYS_MS'));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dlqMetricsTimer) clearInterval(this.dlqMetricsTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async schedule(message: ProviderRetryMessage, delayMs: number): Promise<void> {
    if (!this.delaysMs.includes(delayMs)) {
      throw new Error(`Retraso ${delayMs} ms no está configurado en PROVIDER_RETRY_DELAYS_MS`);
    }
    await this.publish(providerRetryWaitQueue(delayMs), message);
  }

  async deadLetter(message: ProviderRetryMessage & { reason: string; failedAt: string }): Promise<void> {
    await this.publish(PAYMENTS_DLQ, message);
    await this.refreshDlqMetrics();
  }

  /** Reabre la conexión si se cayó; el worker lo llama periódicamente. */
  async ensureConnected(): Promise<void> {
    await this.getChannel();
  }

  async consume(handler: (message: ProviderRetryMessage) => Promise<void>): Promise<void> {
    this.handler = handler;
    if (this.channel) {
      await this.startConsumer(this.channel);
      return;
    }
    await this.getChannel();
  }

  private async publish(queue: string, message: unknown): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
    });
    await channel.waitForConfirms();
  }

  private async startConsumer(channel: amqp.ConfirmChannel): Promise<void> {
    const handler = this.handler;
    if (!handler) return;
    await channel.consume(PROVIDER_RETRY_QUEUE, async (raw) => {
      if (!raw) return;
      try {
        await handler(JSON.parse(raw.content.toString()) as ProviderRetryMessage);
        channel.ack(raw);
      } catch (error) {
        this.logger.error(`Error reintentando pago: ${error instanceof Error ? error.message : error}`);
        channel.nack(raw, false, !raw.fields.redelivered);
      }
    });
    this.logger.log(`Worker de reintentos de pagos consumiendo ${PROVIDER_RETRY_QUEUE}`);
  }

  private async getChannel(): Promise<amqp.ConfirmChannel> {
    if (this.channel) return this.channel;
    if (!this.connecting) {
      this.connecting = this.connect().finally(() => {
        this.connecting = undefined;
      });
    }
    return this.connecting;
  }

  private async connect(): Promise<amqp.ConfirmChannel> {
    const url = this.config.get<string>('rabbitmq.url');
    if (!url) throw new Error('Falta configurar RABBITMQ_URL');

    const connection = await amqp.connect(url, { timeout: 5000 });
    const channel = await connection.createConfirmChannel();
    await channel.prefetch(5);
    await channel.assertQueue(PROVIDER_RETRY_QUEUE, { durable: true });
    await channel.assertQueue(PAYMENTS_DLQ, { durable: true });
    this.startDlqMetricsCollection();
    for (const delay of this.delaysMs) {
      await channel.assertQueue(providerRetryWaitQueue(delay), {
        durable: true,
        messageTtl: delay,
        deadLetterExchange: '',
        deadLetterRoutingKey: PROVIDER_RETRY_QUEUE,
      });
    }

    connection.on('close', () => {
      this.channel = undefined;
      this.connection = undefined;
      this.logger.warn('Conexión de reintentos de pagos con RabbitMQ cerrada; se reconectará en el próximo uso.');
    });
    connection.on('error', (error: Error) => this.logger.error(`RabbitMQ (reintentos de pagos): ${error.message}`));

    this.connection = connection;
    this.channel = channel;
    if (this.handler) await this.startConsumer(channel);
    return channel;
  }

  private startDlqMetricsCollection(): void {
    if (!this.metrics || this.dlqMetricsTimer) return;
    void this.refreshDlqMetrics();
    this.dlqMetricsTimer = setInterval(
      () => void this.refreshDlqMetrics(),
      15_000,
    );
    this.dlqMetricsTimer.unref?.();
  }

  private async refreshDlqMetrics(): Promise<void> {
    if (!this.metrics || !this.channel) return;
    try {
      const queue = await this.channel.checkQueue(PAYMENTS_DLQ);
      this.metrics.setDlqMessages(PAYMENTS_DLQ, queue.messageCount);
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar la DLQ ${PAYMENTS_DLQ}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
}
