import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService } from '../database/prisma-tenant-context.service';
import { DomainEvent } from '../domain/domain-event.base';
import { EVENT_BUS, IEventBus } from './event-bus.interface';
import { Inject } from '@nestjs/common';

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 20;

@Injectable()
export class OutboxEventPublisher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxEventPublisher.name);
  private timer?: ReturnType<typeof setInterval>;
  private flushing?: Promise<void>;

  constructor(
    private readonly database: PrismaTenantContextService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => this.scheduleFlush(), POLL_INTERVAL_MS);
    this.timer.unref?.();
    this.scheduleFlush();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  flushOnce(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.publishPending().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  private scheduleFlush(): void {
    void this.flushOnce().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`No se pudo consultar el outbox: ${message}`);
    });
  }

  private async publishPending(): Promise<void> {
    const rows = await this.database.withGlobalAccess((tx) =>
      tx.domain_event_outbox.findMany({
        where: { status: 'pending' },
        orderBy: { created_at: 'asc' },
        take: BATCH_SIZE,
      }),
    );

    for (const row of rows) {
      try {
        await this.eventBus.publish(eventFromOutbox(row.payload));
        await this.database.withGlobalAccess((tx) =>
          tx.domain_event_outbox.update({
            where: { id: row.id },
            data: {
              status: 'published',
              published_at: new Date(),
              attempt_count: { increment: 1 },
              last_error: null,
            },
          }).then(() => undefined),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'error desconocido';
        this.logger.warn(`Outbox ${row.id} no publicado; se reintentará: ${message}`);
        await this.database.withGlobalAccess((tx) =>
          tx.domain_event_outbox.update({
            where: { id: row.id },
            data: {
              attempt_count: { increment: 1 },
              last_error: message.slice(0, 1000),
            },
          }).then(() => undefined),
        );
      }
    }
  }
}

function eventFromOutbox(value: Prisma.JsonValue): DomainEvent<unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('El payload de outbox no es un evento JSON válido.');
  }

  const envelope = value as Prisma.JsonObject;
  if (
    typeof envelope.eventId !== 'string'
    || typeof envelope.eventName !== 'string'
    || typeof envelope.aggregateId !== 'string'
    || typeof envelope.occurredOn !== 'string'
  ) {
    throw new Error('El sobre del evento outbox está incompleto.');
  }

  return {
    eventId: envelope.eventId,
    eventName: envelope.eventName,
    aggregateId: envelope.aggregateId,
    occurredOn: new Date(envelope.occurredOn),
    payload: envelope.payload,
  } as DomainEvent<unknown>;
}