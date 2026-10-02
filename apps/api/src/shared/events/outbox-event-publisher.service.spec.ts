import { PrismaTenantContextService } from '../database/prisma-tenant-context.service';
import { IEventBus } from './event-bus.interface';
import { OutboxEventPublisher } from './outbox-event-publisher.service';

describe('OutboxEventPublisher', () => {
  const row = {
    id: 'outbox-1',
    payload: {
      eventId: 'event-1',
      occurredOn: '2026-09-29T00:00:00.000Z',
      eventName: 'tenant.creado',
      aggregateId: 'tenant-1',
      payload: { tenantId: 'tenant-1' },
    },
  };

  function createPublisher(publish: jest.Mock) {
    const transaction = {
      domain_event_outbox: {
        findMany: jest.fn().mockResolvedValue([row]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const database = {
      withGlobalAccess: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const eventBus = { publish };
    const publisher = new OutboxEventPublisher(
      database as unknown as PrismaTenantContextService,
      eventBus as unknown as IEventBus,
    );
    return { publisher, transaction };
  }

  it('publishes pending events and marks them published after confirmation', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const { publisher, transaction } = createPublisher(publish);

    await publisher.flushOnce();

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      eventName: 'tenant.creado',
      aggregateId: 'tenant-1',
    }));
    expect(transaction.domain_event_outbox.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({ status: 'published' }),
    }));
  });

  it('keeps failed events pending and records the error for a later retry', async () => {
    const publish = jest.fn().mockRejectedValue(new Error('RabbitMQ unavailable'));
    const { publisher, transaction } = createPublisher(publish);

    await publisher.flushOnce();

    expect(transaction.domain_event_outbox.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({
        attempt_count: { increment: 1 },
        last_error: 'RabbitMQ unavailable',
      }),
    }));
  });
});