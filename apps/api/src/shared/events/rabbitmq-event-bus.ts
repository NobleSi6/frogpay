import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { context, propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import * as amqp from 'amqplib';
import { DomainEvent } from '../domain/domain-event.base';
import { EventHandler, IEventBus } from './event-bus.interface';
import { MetricsService } from '../../modules/observability/metrics.service';
import {
  currentRequestId,
  runWithOptionalRequestId,
} from '../observability/request-context';

const EVENTS_EXCHANGE = 'frogpay.events';
const DEAD_LETTER_EXCHANGE = 'frogpay.events.dlx';
const SMOKE_QUEUE = 'frogpay.events.smoke';

@Injectable()
export class RabbitMqEventBus
  implements IEventBus, OnModuleInit, OnModuleDestroy
{
  readonly provider = 'rabbitmq' as const;
  private readonly logger = new Logger(RabbitMqEventBus.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private connectionPromise?: Promise<void>;
  private dlqMetricsTimer?: ReturnType<typeof setInterval>;
  private readonly pendingRegistrations: Promise<void>[] = [];
  private readonly subscriptions: Array<{
    eventName: string;
    handler: EventHandler<unknown>;
  }> = [];

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      this.logger.warn(
        `RabbitMQ no estÃ¡ disponible al iniciar; se reintentarÃ¡ al publicar o verificar salud: ${this.errorMessage(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dlqMetricsTimer) clearInterval(this.dlqMetricsTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await Promise.all(this.pendingRegistrations);
    const channel = await this.ensureChannel();
    const body = Buffer.from(JSON.stringify(event));
    const traceHeaders: Record<string, string> = {};

    propagation.inject(context.active(), traceHeaders);
    const requestId = currentRequestId();
    if (requestId) traceHeaders['x-request-id'] = requestId;

    channel.publish(EVENTS_EXCHANGE, event.eventName, body, {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: event.eventId,
      timestamp: Math.floor(event.occurredOn.getTime() / 1000),
      type: event.eventName,
      headers: traceHeaders,
    });
    await channel.waitForConfirms();
    this.logger.log(
      `Evento ${event.eventName} publicado (id=${event.eventId})`,
    );
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) await this.publish(event);
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    const subscription = {
      eventName,
      handler: handler as EventHandler<unknown>,
    };
    this.subscriptions.push(subscription);
    const registration = this.ensureChannel()
      .then((channel) => this.registerSubscription(channel, subscription))
      .catch((error: unknown) => {
        this.logger.error(
          `No se pudo registrar consumidor para ${eventName}: ${this.errorMessage(error)}`,
        );
      });
    this.pendingRegistrations.push(registration);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const channel = await this.ensureChannel();
      await channel.checkExchange(EVENTS_EXCHANGE);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureChannel(): Promise<amqp.ConfirmChannel> {
    if (this.channel) return this.channel;
    await this.connect();
    if (!this.channel)
      throw new ServiceUnavailableException('RabbitMQ no está disponible');
    return this.channel;
  }

  private async connect(): Promise<void> {
    if (this.channel) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.openConnection();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = undefined;
    }
  }

  private async openConnection(): Promise<void> {
    const url = this.config.get<string>('rabbitmq.url');
    if (!url)
      throw new ServiceUnavailableException('Falta configurar RABBITMQ_URL');

    const connectionUrl = new URL(url);
    const connectionOptions: amqp.Options.Connect = {
      protocol: connectionUrl.protocol.slice(0, -1),
      hostname: connectionUrl.hostname,
      port: connectionUrl.port ? Number(connectionUrl.port) : undefined,
      username: decodeURIComponent(connectionUrl.username || 'guest'),
      password: decodeURIComponent(connectionUrl.password || 'guest'),
      vhost: decodeURIComponent(connectionUrl.pathname.slice(1)) || '/',
    };
    const locale = connectionUrl.searchParams.get('locale');
    const heartbeat = connectionUrl.searchParams.get('heartbeat');
    const frameMax = connectionUrl.searchParams.get('frameMax');
    if (locale) connectionOptions.locale = locale;
    if (heartbeat) connectionOptions.heartbeat = Number(heartbeat);
    if (frameMax) connectionOptions.frameMax = Number(frameMax);

    const connection = await amqp.connect(connectionOptions, { timeout: 5000 });
    const channel = await connection.createConfirmChannel();
    await channel.prefetch(10);
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', {
      durable: true,
    });

    if (this.config.get<string>('nodeEnv') !== 'production') {
      await channel.assertQueue(SMOKE_QUEUE, { durable: true });
      await channel.bindQueue(
        SMOKE_QUEUE,
        EVENTS_EXCHANGE,
        'arquitectura.prueba',
      );
    }

    this.connection = connection;
    this.channel = channel;
    connection.on('close', () => {
      this.channel = undefined;
      this.connection = undefined;
    });
    connection.on('error', (error) => {
      this.logger.error(`Conexión RabbitMQ falló: ${this.errorMessage(error)}`);
    });

    for (const subscription of this.subscriptions) {
      await this.registerSubscription(channel, subscription);
    }
    this.startDlqMetricsCollection();
    this.logger.log(`Conectado a RabbitMQ (${EVENTS_EXCHANGE})`);
  }

  private async registerSubscription(
    channel: amqp.ConfirmChannel,
    subscription: { eventName: string; handler: EventHandler<unknown> },
  ): Promise<void> {
    const queueName = this.queueName(
      subscription.handler,
      subscription.eventName,
    );
    const deadLetterRoutingKey = `${queueName}.dead`;
    await channel.assertQueue(queueName, {
      durable: true,
      deadLetterExchange: DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey,
    });
    await channel.assertQueue(deadLetterRoutingKey, { durable: true });
    await channel.bindQueue(
      deadLetterRoutingKey,
      DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey,
    );
    await channel.bindQueue(queueName, EVENTS_EXCHANGE, subscription.eventName);
    await channel.consume(queueName, async (message) => {
      if (!message) return;
      try {
        const event = JSON.parse(
          message.content.toString(),
        ) as DomainEvent<unknown>;
        const carrier: Record<string, string> = {};
        for (const [key, value] of Object.entries(
          message.properties.headers ?? {},
        )) {
          if (typeof value === 'string') carrier[key] = value;
          else if (Buffer.isBuffer(value)) carrier[key] = value.toString();
        }
        const parentContext = propagation.extract(ROOT_CONTEXT, carrier);
        await runWithOptionalRequestId(carrier['x-request-id'], () =>
          context.with(parentContext, () => subscription.handler.handle(event)),
        );
        channel.ack(message);
      } catch (error) {
        this.logger.error(
          `Consumidor falló para ${subscription.eventName}: ${this.errorMessage(error)}`,
        );
        channel.nack(message, false, false);
      }
    });
    this.logger.log(`Cola ${queueName} suscrita a ${subscription.eventName}`);
  }

  private queueName(handler: EventHandler<unknown>, eventName: string): string {
    const explicitName = handler.queueName;
    const safeEventName = eventName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return explicitName || `frogpay.api.${safeEventName}`;
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
    const channel = this.channel;
    if (!this.metrics || !channel) return;

    try {
      const queueNames = [
        ...new Set(
          this.subscriptions.map(
            (subscription) =>
              `${this.queueName(
                subscription.handler,
                subscription.eventName,
              )}.dead`,
          ),
        ),
      ];

      const queues = await Promise.all(
        queueNames.map((name) => channel.checkQueue(name)),
      );
      const total = queues.reduce((sum, queue) => sum + queue.messageCount, 0);
      this.metrics.setDlqMessages('frogpay.events.dlq', total);
    } catch (error) {
      this.logger.warn(
        `No se pudieron consultar las DLQ del event bus: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
