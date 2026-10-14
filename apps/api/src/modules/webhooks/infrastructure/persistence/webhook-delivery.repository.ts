import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { WebhookEnvelope } from '../../domain/webhook-envelope';

const LAST_ERROR_MAX_CHARS = 1000;
/** Tiempo que un intento "reserva" la entrega; si el proceso muere, el barrido la recupera después. */
export const DELIVERY_LEASE_MS = 30_000;

export interface DeliveryForDispatch {
  id: string;
  tenantId: string;
  webhookId: string;
  eventId: string | null;
  eventType: string;
  payload: WebhookEnvelope;
  attemptCount: number;
  webhook: { url: string; secretEncrypted: string; usable: boolean };
}

export interface AttemptRecord {
  deliveryId: string;
  tenantId: string;
  attemptNumber: number;
  responseCode: number | null;
  error: string | null;
  durationMs: number;
  succeeded: boolean;
}

/**
 * Persistencia de entregas. Los workers no tienen sesión de usuario, por eso usan
 * acceso global solo en la consulta puntual (regla de RLS del ADR-003); toda
 * escritura sigue llevando el tenant_id del registro.
 */
@Injectable()
export class WebhookDeliveryRepository {
  constructor(private readonly db: PrismaTenantContextService) {}

  /** Endpoints activos del tenant suscritos al evento en el ambiente indicado. */
  findSubscribedWebhookIds(tenantId: string, eventName: string, environment: string): Promise<string[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await tx.webhook.findMany({
        where: {
          tenant_id: tenantId,
          environment,
          is_active: true,
          deleted_at: null,
          event_types: { array_contains: [eventName] },
        },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    });
  }

  /**
   * Crea una entrega por endpoint de forma idempotente: si el evento ya se procesó
   * (mismo eventId), el índice único evita duplicados. Devuelve las entregas que
   * siguen pendientes de su primer intento.
   */
  createDeliveries(input: {
    tenantId: string;
    webhookIds: string[];
    eventId: string;
    eventType: string;
    paymentId: string | null;
    envelope: WebhookEnvelope;
  }): Promise<string[]> {
    return this.db.withTenant(input.tenantId, async (tx) => {
      await tx.webhook_delivery.createMany({
        data: input.webhookIds.map((webhookId) => ({
          webhook_id: webhookId,
          tenant_id: input.tenantId,
          payment_id: input.paymentId,
          event_id: input.eventId,
          event_type: input.eventType,
          payload: input.envelope as unknown as Prisma.InputJsonObject,
          status: 'pending',
          next_retry_at: new Date(),
        })),
        skipDuplicates: true,
      });
      const rows = await tx.webhook_delivery.findMany({
        where: { event_id: input.eventId, webhook_id: { in: input.webhookIds }, status: 'pending', attempt_count: 0 },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    });
  }

  /**
   * Reserva el intento N de forma atómica: solo una copia del mensaje puede
   * pasar de attempt_count = N-1 a N. Evita envíos dobles por mensajes repetidos.
   */
  claimAttempt(deliveryId: string, attemptNumber: number): Promise<boolean> {
    return this.db.withGlobalAccess(async (tx) => {
      const result = await tx.webhook_delivery.updateMany({
        where: { id: deliveryId, status: 'pending', attempt_count: attemptNumber - 1 },
        data: {
          attempt_count: attemptNumber,
          next_retry_at: new Date(Date.now() + DELIVERY_LEASE_MS),
          updated_at: new Date(),
        },
      });
      return result.count === 1;
    });
  }

  loadForDispatch(deliveryId: string): Promise<DeliveryForDispatch | null> {
    return this.db.withGlobalAccess(async (tx) => {
      const row = await tx.webhook_delivery.findUnique({
        where: { id: deliveryId },
        include: { webhook: { select: { url: true, secret_encrypted: true, is_active: true, deleted_at: true } } },
      });
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        webhookId: row.webhook_id,
        eventId: row.event_id,
        eventType: row.event_type,
        payload: row.payload as unknown as WebhookEnvelope,
        attemptCount: row.attempt_count,
        webhook: {
          url: row.webhook.url,
          secretEncrypted: row.webhook.secret_encrypted,
          usable: row.webhook.is_active && row.webhook.deleted_at === null,
        },
      };
    });
  }

  /** Registra el intento en el historial y actualiza el estado de la entrega en una sola transacción. */
  recordAttempt(
    attempt: AttemptRecord,
    outcome:
      | { kind: 'delivered' }
      | { kind: 'retry'; nextRetryAt: Date }
      | { kind: 'failed' },
  ): Promise<void> {
    const lastError = attempt.error?.slice(0, LAST_ERROR_MAX_CHARS) ?? null;
    return this.db.withTenant(attempt.tenantId, async (tx) => {
      await tx.webhook_delivery_attempt.create({
        data: {
          delivery_id: attempt.deliveryId,
          tenant_id: attempt.tenantId,
          attempt_number: attempt.attemptNumber,
          response_code: attempt.responseCode,
          error: lastError,
          duration_ms: Math.max(0, Math.round(attempt.durationMs)),
          succeeded: attempt.succeeded,
        },
      });
      await tx.webhook_delivery.update({
        where: { id: attempt.deliveryId },
        data: {
          response_code: attempt.responseCode,
          last_error: outcome.kind === 'delivered' ? null : lastError,
          status: outcome.kind === 'delivered' ? 'delivered' : outcome.kind === 'retry' ? 'pending' : 'failed',
          delivered_at: outcome.kind === 'delivered' ? new Date() : undefined,
          next_retry_at: outcome.kind === 'retry' ? outcome.nextRetryAt : null,
          updated_at: new Date(),
        },
      });
    });
  }

  /** Entregas pendientes cuya reserva o reintento venció hace rato (proceso reiniciado, mensaje perdido). */
  findStuckDeliveries(olderThan: Date, limit: number): Promise<Array<{ id: string; attemptCount: number }>> {
    return this.db.withGlobalAccess(async (tx) => {
      const rows = await tx.webhook_delivery.findMany({
        where: { status: 'pending', next_retry_at: { lt: olderThan } },
        orderBy: { next_retry_at: 'asc' },
        take: limit,
        select: { id: true, attempt_count: true },
      });
      return rows.map((row) => ({ id: row.id, attemptCount: row.attempt_count }));
    });
  }

  /** Reprograma una entrega atascada para que el siguiente intento la tome. */
  touchForRecovery(deliveryId: string, attemptCount: number): Promise<boolean> {
    return this.db.withGlobalAccess(async (tx) => {
      const result = await tx.webhook_delivery.updateMany({
        where: { id: deliveryId, status: 'pending', attempt_count: attemptCount },
        data: { next_retry_at: new Date(Date.now() + DELIVERY_LEASE_MS), updated_at: new Date() },
      });
      return result.count === 1;
    });
  }
}
