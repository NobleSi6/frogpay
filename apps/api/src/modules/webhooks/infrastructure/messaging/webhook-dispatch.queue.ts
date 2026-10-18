import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { MetricsService } from '../../../observability/metrics.service';
import { WEBHOOK_RETRY_DELAYS_MS } from '../../domain/retry-policy';

/**
 * Topología de RabbitMQ para la entrega de webhooks (TSK-DEV2-302):
 *
 *   frogpay.webhooks.dispatch      cola de trabajo que consume el worker
 *   frogpay.webhooks.retry.<ms>    colas de espera con TTL; al vencer, el mensaje
 *                                  vuelve a dispatch mediante dead-letter
 *   frogpay.webhooks.dlq           entregas que agotaron los reintentos
 *
 * El retraso no bloquea al consumidor: el mensaje "duerme" en la cola de espera.
 */
export const WEBHOOK_DISPATCH_QUEUE = 'frogpay.webhooks.dispatch';
export const WEBHOOK_DLQ = 'frogpay.webhooks.dlq';
export const retryQueueName = (delayMs: number): string => `frogpay.webhooks.retry.${delayMs}`;

export interface WebhookDispatchMessage {
  deliveryId: string;
  /** Número de intento que se va a ejecutar (1 = inicial). */
  attempt: number;
  /** Reenvío manual desde el dashboard: un solo intento, sin nueva ronda de reintentos. */
  manual?: boolean;
}

export interface WebhookDeadLetterMessage {
  deliveryId: string;
  tenantId: string;
  webhookId: string;
  eventId: string | null;
  eventName: string;
  attempts: number;
  lastError: string | null;
  failedAt: string;
}

@Injectable()
export class WebhookDispatchQueue implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatchQueue.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private connecting?: Promise<amqp.ConfirmChannel>;
  private handler?: (message: WebhookDispatchMessage) => Promise<void>;
  private dlqMetricsTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.dlqMetricsTimer) clearInterval(this.dlqMetricsTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async enqueue(message: WebhookDispatchMessage, delayMs = 0): Promise<void> {
    if (delayMs > 0 && !WEBHOOK_RETRY_DELAYS_MS.includes(delayMs)) {
      throw new Error(`Retraso ${delayMs} ms no está definido en la política de reintentos`);
    }
    const channel = await this.getChannel();
    const queue = delayMs > 0 ? retryQueueName(delayMs) : WEBHOOK_DISPATCH_QUEUE;
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
    });
    await channel.waitForConfirms();
  }

  async sendToDeadLetter(message: WebhookDeadLetterMessage): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(WEBHOOK_DLQ, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
    });
    await channel.waitForConfirms();
    await this.refreshDlqMetrics();
  }

  /** Registra el worker; si la conexión se cae, se vuelve a suscribir al reconectar. */
  async consume(handler: (message: WebhookDispatchMessage) => Promise<void>): Promise<void> {
    this.handler = handler;
    if (this.channel) {
      await this.startConsumer(this.channel);
      return;
    }
    // connect() inicia el consumidor en cuanto existe el canal.
    await this.getChannel();
  }

  /** Reabre la conexión si se cayó (lo llama el barrido periódico). */
  async ensureConnected(): Promise<void> {
    await this.getChannel();
  }

  private async startConsumer(channel: amqp.ConfirmChannel): Promise<void> {
    const handler = this.handler;
    if (!handler) return;
    await channel.consume(WEBHOOK_DISPATCH_QUEUE, async (raw) => {
      if (!raw) return;
      try {
        await handler(JSON.parse(raw.content.toString()) as WebhookDispatchMessage);
        channel.ack(raw);
      } catch (error) {
        // El worker registra los fallos HTTP en BD; esto solo cubre errores inesperados
        // (BD caída, etc.). Se reencola una vez y, si vuelve a fallar, lo recupera el barrido.
        this.logger.error(`Error procesando entrega de webhook: ${error instanceof Error ? error.message : error}`);
        channel.nack(raw, false, !raw.fields.redelivered);
      }
    });
    this.logger.log(`Worker de webhooks consumiendo ${WEBHOOK_DISPATCH_QUEUE}`);
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

    await channel.assertQueue(WEBHOOK_DISPATCH_QUEUE, { durable: true });
    await channel.assertQueue(WEBHOOK_DLQ, { durable: true });
    this.startDlqMetricsCollection();
    for (const delay of WEBHOOK_RETRY_DELAYS_MS) {
      await channel.assertQueue(retryQueueName(delay), {
        durable: true,
        messageTtl: delay,
        deadLetterExchange: '',
        deadLetterRoutingKey: WEBHOOK_DISPATCH_QUEUE,
      });
    }

    connection.on('close', () => {
      this.channel = undefined;
      this.connection = undefined;
      this.logger.warn('Conexión de webhooks con RabbitMQ cerrada; se reconectará en el próximo uso.');
    });
    connection.on('error', (error: Error) => this.logger.error(`RabbitMQ (webhooks): ${error.message}`));

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
      const queue = await this.channel.checkQueue(WEBHOOK_DLQ);
      this.metrics.setDlqMessages(WEBHOOK_DLQ, queue.messageCount);
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar la DLQ ${WEBHOOK_DLQ}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
}
