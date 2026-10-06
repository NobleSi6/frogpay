import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService } from '../database/prisma-tenant-context.service';
import { DomainEvent } from '../domain/domain-event.base';
import { EVENT_BUS, IEventBus } from './event-bus.interface';
import { Inject } from '@nestjs/common';

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 20;
const LAST_ERROR_MAX_CHARS = 1000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MAX_EXPONENT = 10;
const LEGACY_ENVELOPE_KEYS = ['eventId', 'eventName', 'aggregateId', 'occurredOn'] as const;

export interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  tenant_id: string | null;
  event_type: string;
  payload: Prisma.JsonValue;
  created_at: Date;
  attempt_count: number;
  status: string;
  last_error?: string | null;
  published_at?: Date | null;
}

export class OutboxPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxPayloadError';
  }
}

@Injectable()
export class OutboxEventPublisher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxEventPublisher.name);
  private timer?: ReturnType<typeof setInterval>;
  private flushing?: Promise<void>;
  private cycleCounter = 0;
  private lastCycleId = 0;
  private backoffAppliedCycle = 0;
  private lastCycleHadTransientFailure = false;
  private transientFailureStreak = 0;
  private nextFlushAt = 0;

  constructor(
    private readonly database: PrismaTenantContextService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('outboxPublisherEnabled')) {
      this.logger.warn(
        'Outbox publisher deshabilitado (OUTBOX_PUBLISHER_ENABLED=false): no se iniciará el timer de publicación.',
      );
      return;
    }
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
    if (Date.now() < this.nextFlushAt) return;
    void this.flushOnce()
      .then(() => this.applyBackoff(this.lastCycleId, this.lastCycleHadTransientFailure))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'error desconocido';
        this.logger.error(`No se pudo consultar el outbox: ${message}`);
      });
  }

  private applyBackoff(cycleId: number, hadTransientFailure: boolean): void {
    if (cycleId === this.backoffAppliedCycle) return;
    this.backoffAppliedCycle = cycleId;

    if (!hadTransientFailure) {
      this.transientFailureStreak = 0;
      this.nextFlushAt = 0;
      return;
    }

    this.transientFailureStreak = Math.min(this.transientFailureStreak + 1, BACKOFF_MAX_EXPONENT);
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** this.transientFailureStreak, BACKOFF_MAX_MS);
    this.nextFlushAt = Date.now() + delay;
    this.logger.warn(`Outbox: siguiente flush retrasado ${delay} ms por fallo transitorio.`);
  }

  private async publishPending(): Promise<void> {
    const cycleId = ++this.cycleCounter;
    this.lastCycleId = cycleId;
    this.lastCycleHadTransientFailure = false;

    const rows = await this.database.withGlobalAccess((tx) =>
      tx.domain_event_outbox.findMany({
        where: { status: 'pending' },
        orderBy: { created_at: 'asc' },
        take: BATCH_SIZE,
      }),
    ) as OutboxRow[];

    for (const row of rows) {
      let event: DomainEvent<unknown>;
      try {
        event = eventFromOutboxRow(row);
      } catch (error) {
        const message = errorMessage(error);
        this.logger.error(`Outbox id=${row.id} event_type=${row.event_type} descartado: ${message}`);
        await this.updateRow(row, {
          status: 'failed',
          attempt_count: { increment: 1 },
          last_error: message.slice(0, LAST_ERROR_MAX_CHARS),
        });
        continue;
      }

      try {
        await this.eventBus.publish(event);
      } catch (error) {
        const message = errorMessage(error);
        const attempts = row.attempt_count + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        this.lastCycleHadTransientFailure = true;

        if (exhausted) {
          this.logger.error(
            `Outbox id=${row.id} event_type=${row.event_type} marcado como failed tras ${attempts} intentos: ${message}`,
          );
          await this.updateRow(row, {
            status: 'failed',
            attempt_count: { increment: 1 },
            last_error: message.slice(0, LAST_ERROR_MAX_CHARS),
          });
        } else {
          this.logger.warn(`Outbox ${row.id} no publicado (intento ${attempts}/${MAX_ATTEMPTS}); se reintentará: ${message}`);
          await this.updateRow(row, {
            attempt_count: { increment: 1 },
            last_error: message.slice(0, LAST_ERROR_MAX_CHARS),
          });
        }
        break;
      }

      await this.updateRow(row, {
        status: 'published',
        published_at: new Date(),
        attempt_count: { increment: 1 },
        last_error: null,
      });
    }
  }

  private updateRow(row: OutboxRow, data: Prisma.domain_event_outboxUpdateInput): Promise<void> {
    return this.database.withGlobalAccess((tx) =>
      tx.domain_event_outbox.update({
        where: { id: row.id },
        data,
      }).then(() => undefined),
    );
  }
}

export function eventFromOutboxRow(row: OutboxRow): DomainEvent<unknown> {
  const raw = row.payload;

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new OutboxPayloadError('El payload del outbox no es un objeto JSON válido.');
  }

  const envelope = raw as Prisma.JsonObject;
  let businessPayload: Prisma.JsonValue = raw;

  if (LEGACY_ENVELOPE_KEYS.every((key) => key in envelope)) {
    if (!('payload' in envelope)) {
      throw new OutboxPayloadError('El sobre legado del outbox está incompleto: falta "payload".');
    }
    const inner = envelope.payload;
    if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
      throw new OutboxPayloadError('El payload del sobre legado no es un objeto JSON válido.');
    }
    businessPayload = inner;
  }

  return {
    eventId: row.id,
    eventName: row.event_type,
    aggregateId: row.aggregate_id,
    tenantId: row.tenant_id,
    occurredOn: row.created_at,
    payload: businessPayload,
  } as DomainEvent<unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'error desconocido';
}
