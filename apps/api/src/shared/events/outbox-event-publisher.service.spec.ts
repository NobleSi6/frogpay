import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTenantContextService } from '../database/prisma-tenant-context.service';
import { IEventBus } from './event-bus.interface';
import { OutboxEventPublisher, OutboxRow } from './outbox-event-publisher.service';

describe('OutboxEventPublisher', () => {
  const created_at = new Date('2026-09-29T00:00:00.000Z');
  const paymentPayload = {
    paymentId: 'pay-1',
    amount: '15.00',
    currency: 'BOB',
    paymentMethod: 'card',
    environment: 'sandbox',
    merchantReference: 'ref-205',
    commissionAmount: '0.45',
    netAmount: '14.55',
    providerTransactionId: 'provider-tx-1',
  };

  function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      aggregate_type: 'payment',
      aggregate_id: '22222222-2222-4222-8222-222222222222',
      tenant_id: '33333333-3333-4333-8333-333333333333',
      event_type: 'pago.aprobado',
      payload: paymentPayload,
      created_at,
      attempt_count: 0,
      status: 'pending',
      last_error: null,
      published_at: null,
      ...overrides,
    };
  }

  function createPublisher(rows: OutboxRow[], publish: jest.Mock, outboxPublisherEnabled = true) {
    const transaction = {
      domain_event_outbox: {
        findMany: jest.fn(async (args?: { take?: number }) =>
          rows
            .filter((candidate) => candidate.status === 'pending')
            .slice()
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
            .slice(0, args?.take ?? rows.length),
        ),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rows.find((candidate) => candidate.id === where.id);
          if (!row) throw new Error(`Fila ${where.id} inexistente`);
          for (const [key, value] of Object.entries(data)) {
            if (key === 'attempt_count' && value && typeof value === 'object' && 'increment' in (value as object)) {
              row.attempt_count += (value as { increment: number }).increment;
            } else {
              (row as unknown as Record<string, unknown>)[key] = value;
            }
          }
          return row;
        }),
      },
    };
    const database = {
      withGlobalAccess: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const publisher = new OutboxEventPublisher(
      database as unknown as PrismaTenantContextService,
      { publish } as unknown as IEventBus,
      {
        get: jest.fn((key?: string) => (key === 'outboxPublisherEnabled' ? outboxPublisherEnabled : undefined)),
      } as unknown as ConfigService,
    );
    return { publisher, transaction, rows };
  }

  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('publica pago.aprobado armado desde las columnas de la fila', async () => {
    const row = makeRow();
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher } = createPublisher([row], publish);

    await publisher.flushOnce();

    expect(publish).toHaveBeenCalledTimes(1);
    const published = publish.mock.calls[0][0];
    expect(published).toEqual(expect.objectContaining({
      eventId: row.id,
      eventName: 'pago.aprobado',
      aggregateId: row.aggregate_id,
      tenantId: row.tenant_id,
      occurredOn: created_at,
      payload: paymentPayload,
    }));
    expect(published.payload).toEqual(paymentPayload);
    expect(JSON.parse(JSON.stringify(published))).toEqual(expect.objectContaining({
      eventId: row.id,
      eventName: 'pago.aprobado',
      tenantId: row.tenant_id,
      payload: paymentPayload,
    }));
    expect(row.status).toBe('published');
    expect(row.published_at).toBeInstanceOf(Date);
    expect(row.attempt_count).toBe(1);
    expect(row.last_error).toBeNull();
  });

  it('ante un fallo transitorio conserva pending, incrementa attempt_count y guarda last_error', async () => {
    const row = makeRow();
    const publish = jest.fn().mockRejectedValue(new Error('RabbitMQ unavailable'));
    const { publisher } = createPublisher([row], publish);

    await publisher.flushOnce();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('pending');
    expect(row.attempt_count).toBe(1);
    expect(row.last_error).toBe('RabbitMQ unavailable');
    expect(row.published_at).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('intento 1/20'));
  });

  it('se recupera reintentando con el mismo eventId y termina published', async () => {
    const row = makeRow();
    const publish = jest.fn()
      .mockRejectedValueOnce(new Error('broker caído'))
      .mockResolvedValueOnce(undefined);
    const { publisher } = createPublisher([row], publish);

    await publisher.flushOnce();
    expect(row.status).toBe('pending');
    expect(row.attempt_count).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);

    await publisher.flushOnce();
    expect(row.status).toBe('published');
    expect(row.attempt_count).toBe(2);
    expect(row.last_error).toBeNull();
    expect(publish).toHaveBeenCalledTimes(2);

    const first = publish.mock.calls[0][0];
    const second = publish.mock.calls[1][0];
    expect(first.eventId).toBe(row.id);
    expect(second.eventId).toBe(row.id);
    expect(second.eventId).toBe(first.eventId);
    expect(second.eventName).toBe('pago.aprobado');
    expect(second.payload).toEqual(paymentPayload);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('marca failed cuando se agotan los reintentos (MAX_ATTEMPTS) y reporta el error', async () => {
    const row = makeRow();
    const publish = jest.fn().mockRejectedValue(new Error('broker caído'));
    const { publisher } = createPublisher([row], publish);

    for (let attempt = 1; attempt < 20; attempt += 1) {
      await publisher.flushOnce();
      expect(row.status).toBe('pending');
      expect(row.attempt_count).toBe(attempt);
    }

    await publisher.flushOnce();

    expect(row.status).toBe('failed');
    expect(row.attempt_count).toBe(20);
    expect(row.last_error).toBe('broker caído');
    expect(publish).toHaveBeenCalledTimes(20);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(row.id));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(row.event_type));
  });

  it('marca failed de inmediato con payload inválido y no llama al bus', async () => {
    const row = makeRow({ payload: 'no-es-un-objeto' });
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher } = createPublisher([row], publish);

    await publisher.flushOnce();

    expect(publish).not.toHaveBeenCalled();
    expect(row.status).toBe('failed');
    expect(row.last_error).toContain('no es un objeto JSON válido');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(row.id));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(row.event_type));
  });

  it('continúa con la siguiente fila cuando una tiene payload inválido', async () => {
    const broken = makeRow({
      id: '11111111-1111-4111-8111-111111111110',
      created_at: new Date('2026-09-29T00:00:00.000Z'),
      payload: null,
    });
    const valid = makeRow({
      id: '11111111-1111-4111-8111-111111111112',
      created_at: new Date('2026-09-29T00:00:01.000Z'),
      event_type: 'pago.creado',
      payload: { paymentId: 'pay-2' },
    });
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher } = createPublisher([valid, broken], publish);

    await publisher.flushOnce();

    expect(broken.status).toBe('failed');
    expect(valid.status).toBe('published');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].eventId).toBe(valid.id);
    expect(publish.mock.calls[0][0].eventName).toBe('pago.creado');
  });

  it('publica intacto el payload de negocio que solo contiene la clave eventName', async () => {
    const businessPayload = { ...paymentPayload, eventName: 'detalle-del-comercio' };
    const row = makeRow({ payload: businessPayload });
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher } = createPublisher([row], publish);

    await publisher.flushOnce();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].payload).toEqual(businessPayload);
    expect(row.status).toBe('published');
    expect(row.last_error).toBeNull();
  });

  it('corta el lote cuando la primera fila falla de forma transitoria', async () => {
    const first = makeRow({
      id: '11111111-1111-4111-8111-111111111120',
      created_at: new Date('2026-09-29T00:00:00.000Z'),
    });
    const second = makeRow({
      id: '11111111-1111-4111-8111-111111111121',
      created_at: new Date('2026-09-29T00:00:01.000Z'),
      event_type: 'pago.creado',
      payload: { paymentId: 'pay-3' },
    });
    const publish = jest.fn()
      .mockRejectedValueOnce(new Error('broker caído'))
      .mockResolvedValue(undefined);
    const { publisher } = createPublisher([first, second], publish);

    await publisher.flushOnce();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].eventId).toBe(first.id);
    expect(first.status).toBe('pending');
    expect(first.attempt_count).toBe(1);
    expect(first.last_error).toBe('broker caído');
    expect(second.status).toBe('pending');
    expect(second.attempt_count).toBe(0);
    expect(second.last_error).toBeNull();
  });

  it('aplica backoff exponencial entre ciclos tras un fallo transitorio', async () => {
    jest.useFakeTimers();
    const row = makeRow();
    const publish = jest.fn().mockRejectedValue(new Error('broker caído'));
    const { publisher } = createPublisher([row], publish);

    publisher.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].eventId).toBe(row.id);

    await jest.advanceTimersByTimeAsync(1000);
    expect(publish).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4000);
    expect(publish).toHaveBeenCalledTimes(3);

    publisher.onModuleDestroy();
  });

  it('con OUTBOX_PUBLISHER_ENABLED=false no arranca el timer y loguea warn', async () => {
    jest.useFakeTimers();
    const row = makeRow();
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher } = createPublisher([row], publish, false);

    publisher.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);

    expect(publish).not.toHaveBeenCalled();
    expect(row.status).toBe('pending');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OUTBOX_PUBLISHER_ENABLED=false'));
    publisher.onModuleDestroy();
  });

  it('usa el camino legado cuando payload contiene el sobre completo', async () => {
    const row = makeRow({
      event_type: 'tenant.creado',
      aggregate_type: 'tenant',
      aggregate_id: '44444444-4444-4444-8444-444444444444',
      payload: {
        eventId: 'legacy-event-id',
        occurredOn: '2026-01-01T00:00:00.000Z',
        eventName: 'tenant.creado',
        aggregateId: '44444444-4444-4444-8444-444444444444',
        payload: { tenantId: '44444444-4444-4444-8444-444444444444', name: 'Frog SA' },
      },
    });
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher } = createPublisher([row], publish);

    await publisher.flushOnce();

    const published = publish.mock.calls[0][0];
    expect(published.eventId).toBe(row.id);
    expect(published.eventName).toBe('tenant.creado');
    expect(published.aggregateId).toBe(row.aggregate_id);
    expect(published.tenantId).toBe(row.tenant_id);
    expect(published.occurredOn).toBe(created_at);
    expect(published.payload).toEqual({ tenantId: '44444444-4444-4444-8444-444444444444', name: 'Frog SA' });
    expect(row.status).toBe('published');
  });
});
