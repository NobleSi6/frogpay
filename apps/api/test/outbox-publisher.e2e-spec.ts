import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, domain_event_outbox } from '@prisma/client';
import * as amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import configuration from '../src/config/configuration';
import { validateEnvironment } from '../src/config/env.validation';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { PrismaTenantContextService } from '../src/shared/database/prisma-tenant-context.service';
import { DomainEvent } from '../src/shared/domain/domain-event.base';
import { EventBusModule } from '../src/shared/events/event-bus.module';
import { IEventBus } from '../src/shared/events/event-bus.interface';
import { OutboxEventPublisher } from '../src/shared/events/outbox-event-publisher.service';
import { RabbitMqEventBus } from '../src/shared/events/rabbitmq-event-bus';

jest.setTimeout(120000);

process.env.OUTBOX_PUBLISHER_ENABLED = 'true';

const EVENTS_EXCHANGE = 'frogpay.events';

function sleep(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

async function connectToBroker(config: ConfigService): Promise<amqp.ChannelModel> {
  const rawUrl = config.getOrThrow<string>('rabbitmq.url');
  const parsed = new URL(rawUrl);
  return amqp.connect(
    {
      protocol: parsed.protocol.slice(0, -1),
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      username: decodeURIComponent(parsed.username || 'guest'),
      password: decodeURIComponent(parsed.password || 'guest'),
      vhost: decodeURIComponent(parsed.pathname.slice(1)) || '/',
    },
    { timeout: 5000 },
  );
}

describe('Outbox publisher (e2e: PostgreSQL + RabbitMQ real) - TSK-ARQ-205', () => {
  let moduleRef: TestingModule;
  let db: PrismaTenantContextService;
  let prisma: PrismaService;
  let bus: RabbitMqEventBus;
  let publisher: OutboxEventPublisher;
  let config: ConfigService;
  let consumerConnection: amqp.ChannelModel | undefined;
  const inbox: amqp.ConsumeMessage[] = [];
  const createdIds: string[] = [];

  async function insertOutboxRow(
    overrides: Partial<Prisma.domain_event_outboxUncheckedCreateInput> = {},
  ): Promise<domain_event_outbox> {
    const row = await db.withGlobalAccess((tx) =>
      tx.domain_event_outbox.create({
        data: {
          aggregate_type: 'payment',
          aggregate_id: randomUUID(),
          event_type: 'pago.aprobado',
          payload: { monto: 150, moneda: 'BOB' },
          ...overrides,
        },
      }),
    );
    createdIds.push(row.id);
    return row;
  }

  async function waitForRowStatus(
    id: string,
    status: 'pending' | 'published' | 'failed',
    timeoutMs = 30000,
  ): Promise<domain_event_outbox> {
    const deadline = Date.now() + timeoutMs;
    let current: domain_event_outbox | null = null;
    while (Date.now() < deadline) {
      current = await db.withGlobalAccess((tx) =>
        tx.domain_event_outbox.findUnique({ where: { id } }),
      );
      if (current && current.status === status) return current;
      await sleep(100);
    }
    throw new Error(
      `Timeout esperando status="${status}" para outbox ${id}; ` +
        `último status=${current?.status ?? 'no encontrado'} ` +
        `attempt_count=${current?.attempt_count ?? '?'} ` +
        `last_error=${current?.last_error ?? 'null'}`,
    );
  }

  async function waitForMessage(
    messageId: string,
    timeoutMs = 30000,
  ): Promise<amqp.ConsumeMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = inbox.find((message) => message.properties.messageId === messageId);
      if (found) return found;
      await sleep(100);
    }
    throw new Error(`Timeout esperando mensaje en RabbitMQ con messageId=${messageId}`);
  }

  function bodyOf(message: amqp.ConsumeMessage): any {
    return JSON.parse(message.content.toString('utf8'));
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
          load: [configuration],
          validate: validateEnvironment,
        }),
        PrismaModule,
        EventBusModule,
      ],
    }).compile();

    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (/supabase/i.test(databaseUrl) && process.env.ALLOW_SHARED_DB !== '1') {
      throw new Error(
        'El e2e del outbox no puede ejecutarse contra Supabase compartida. ' +
          'Configura una base local o define ALLOW_SHARED_DB=1 explícitamente.',
      );
    }

    db = moduleRef.get(PrismaTenantContextService);
    prisma = moduleRef.get(PrismaService);
    bus = moduleRef.get(RabbitMqEventBus);
    publisher = moduleRef.get(OutboxEventPublisher);
    config = moduleRef.get(ConfigService);

    expect(await bus.checkHealth()).toBe(true);

    consumerConnection = await connectToBroker(config);
    const consumerChannel = await consumerConnection.createChannel();
    await consumerChannel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
    const capture = await consumerChannel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    await consumerChannel.bindQueue(capture.queue, EVENTS_EXCHANGE, '#');
    await consumerChannel.consume(
      capture.queue,
      (message) => {
        if (message) inbox.push(message);
      },
      { noAck: true },
    );
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      try {
        await db.withGlobalAccess((tx) =>
          tx.domain_event_outbox.deleteMany({ where: { id: { in: createdIds } } }),
        );
      } catch (error) {
        console.warn('No se pudieron limpiar las filas del outbox e2e:', error);
      }
    }
    if (moduleRef) {
      try {
        await moduleRef.close();
      } catch (error) {
        console.warn('No se pudo cerrar el TestingModule:', error);
      }
    }
    publisher?.onModuleDestroy();
    await consumerConnection?.close().catch(() => undefined);
    await bus?.onModuleDestroy().catch(() => undefined);
    await prisma?.onModuleDestroy().catch(() => undefined);
  });

  it('publica la fila pending como mensaje confirmado en RabbitMQ y la marca published', async () => {
    const row = await insertOutboxRow({
      event_type: 'pago.aprobado',
      payload: { monto: 150.5, moneda: 'BOB', referencia: 'e2e-outbox-001' },
    });
    expect(row.status).toBe('pending');
    expect(row.attempt_count).toBe(0);

    await publisher.flushOnce();

    const published = await waitForRowStatus(row.id, 'published');
    expect(published.published_at).toBeInstanceOf(Date);
    expect(published.attempt_count).toBe(1);
    expect(published.last_error).toBeNull();

    const message = await waitForMessage(row.id);
    expect(message.fields.exchange).toBe(EVENTS_EXCHANGE);
    expect(message.fields.routingKey).toBe('pago.aprobado');
    expect(message.properties.messageId).toBe(row.id);
    expect(message.properties.type).toBe('pago.aprobado');
    expect(message.properties.contentType).toBe('application/json');
    expect(message.properties.deliveryMode).toBe(2);
    expect(message.properties.timestamp).toBe(Math.floor(row.created_at.getTime() / 1000));

    const body = bodyOf(message);
    expect(body).toMatchObject({
      eventId: row.id,
      eventName: 'pago.aprobado',
      aggregateId: row.aggregate_id,
      tenantId: row.tenant_id,
      payload: { monto: 150.5, moneda: 'BOB', referencia: 'e2e-outbox-001' },
    });
    expect(new Date(body.occurredOn).getTime()).toBe(row.created_at.getTime());
  });

  it('desenvuelve el sobre legado tenant.creado usando las columnas de la fila', async () => {
    const row = await insertOutboxRow({
      event_type: 'tenant.creado',
      payload: {
        eventId: '00000000-0000-4000-8000-0000000000aa',
        eventName: 'tenant.creado',
        aggregateId: '00000000-0000-4000-8000-0000000000bb',
        occurredOn: '2026-01-01T00:00:00.000Z',
        payload: { nombre: 'Empresa Demo', plan: 'pro' },
      },
    });

    await publisher.flushOnce();
    await waitForRowStatus(row.id, 'published');

    const message = await waitForMessage(row.id);
    expect(message.properties.type).toBe('tenant.creado');
    expect(message.fields.routingKey).toBe('tenant.creado');

    const body = bodyOf(message);
    expect(body.eventId).toBe(row.id);
    expect(body.eventName).toBe('tenant.creado');
    expect(body.aggregateId).toBe(row.aggregate_id);
    expect(body.tenantId).toBe(row.tenant_id);
    expect(new Date(body.occurredOn).getTime()).toBe(row.created_at.getTime());
    expect(body.payload).toEqual({ nombre: 'Empresa Demo', plan: 'pro' });
  });

  it('marca failed sin publicar cuando el payload no es un objeto JSON válido', async () => {
    const row = await insertOutboxRow({
      event_type: 'pago.fallido',
      payload: 'esto-no-es-un-objeto',
    });

    await publisher.flushOnce();

    const failed = await waitForRowStatus(row.id, 'failed');
    expect(failed.attempt_count).toBe(1);
    expect(failed.published_at).toBeNull();
    expect(failed.last_error).toContain('no es un objeto JSON válido');

    await sleep(500);
    expect(inbox.some((message) => message.properties.messageId === row.id)).toBe(false);
  });

  it('conserva la fila pending tras un fallo transitorio y publica el mismo eventId al recuperar', async () => {
    let brokerFailures = 1;
    const flakyBus: IEventBus = {
      provider: 'rabbitmq',
      async publish<T>(event: DomainEvent<T>): Promise<void> {
        if (brokerFailures > 0) {
          brokerFailures -= 1;
          throw new Error('RabbitMQ no disponible (fallo simulado)');
        }
        await bus.publish(event);
      },
      async publishAll(events: DomainEvent[]): Promise<void> {
        for (const event of events) await flakyBus.publish(event);
      },
      subscribe: () => undefined,
      checkHealth: async () => true,
    };
    const flakyPublisher = new OutboxEventPublisher(db, flakyBus, config);

    const row = await insertOutboxRow({
      event_type: 'pago.aprobado',
      payload: { monto: 99.9, moneda: 'BOB' },
    });

    await flakyPublisher.flushOnce();

    const afterFailure = await db.withGlobalAccess((tx) =>
      tx.domain_event_outbox.findUnique({ where: { id: row.id } }),
    );
    expect(afterFailure).not.toBeNull();
    expect(afterFailure?.status).toBe('pending');
    expect(afterFailure?.attempt_count).toBe(1);
    expect(afterFailure?.last_error).toContain('fallo simulado');
    expect(inbox.some((message) => message.properties.messageId === row.id)).toBe(false);

    await publisher.flushOnce();

    const recovered = await waitForRowStatus(row.id, 'published');
    expect(recovered.attempt_count).toBe(2);
    expect(recovered.last_error).toBeNull();

    const message = await waitForMessage(row.id);
    expect(message.properties.messageId).toBe(row.id);
    expect(bodyOf(message)).toMatchObject({
      eventId: row.id,
      eventName: 'pago.aprobado',
    });
  });

  it('el timer de 1s del publisher publica filas pendientes sin intervención manual', async () => {
    publisher.onApplicationBootstrap();
    try {
      const row = await insertOutboxRow({
        event_type: 'pago.aprobado',
        payload: { monto: 42, moneda: 'BOB' },
      });

      const message = await waitForMessage(row.id);
      expect(message.fields.routingKey).toBe('pago.aprobado');

      const published = await waitForRowStatus(row.id, 'published');
      expect(published.attempt_count).toBe(1);
      expect(published.published_at).toBeInstanceOf(Date);
    } finally {
      publisher.onModuleDestroy();
    }
  });
});
