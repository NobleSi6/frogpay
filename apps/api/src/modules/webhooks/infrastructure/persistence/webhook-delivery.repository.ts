import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { WebhookEnvelope } from '../../domain/webhook-envelope';

const LAST_ERROR_MAX_CHARS = 1000;
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

/**
 * Repositorio compatible con el schema actual de Prisma del proyecto.
 * No usa columnas inexistentes ni modelos no generados en el código actual.
 */
@Injectable()
export class WebhookDeliveryRepository {
  constructor(private readonly db: PrismaTenantContextService) {}

  findSubscribedWebhookIds(tenantId: string, eventName: string, _environment: string): Promise<string[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await tx.webhook.findMany({
        where: { tenant_id: tenantId, is_active: true },
        select: { id: true, event_types: true },
      });
      return rows
        .filter((row) => Array.isArray(row.event_types) && row.event_types.includes(eventName))
        .map((row) => row.id);
    });
  }

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
          event_type: input.eventType,
          payload: input.envelope as unknown as Prisma.InputJsonValue,
          status: 'pending',
          next_retry_at: new Date(),
        })),
      });

      const rows = await tx.webhook_delivery.findMany({
        where: { tenant_id: input.tenantId, event_type: input.eventType, webhook_id: { in: input.webhookIds } },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    });
  }

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
        include: { webhook: { select: { url: true, secret_encrypted: true, is_active: true } } },
      });
      if (!row) return null;

      return {
        id: row.id,
        tenantId: row.tenant_id,
        webhookId: row.webhook_id,
        eventId: null,
        eventType: row.event_type,
        payload: row.payload as unknown as WebhookEnvelope,
        attemptCount: row.attempt_count,
        webhook: {
          url: row.webhook.url,
          secretEncrypted: row.webhook.secret_encrypted,
          usable: row.webhook.is_active,
        },
      };
    });
  }

  recordAttempt(
    attempt: {
      deliveryId: string;
      tenantId: string;
      attemptNumber: number;
      responseCode: number | null;
      error: string | null;
      durationMs: number;
      succeeded: boolean;
    },
    outcome: { kind: 'delivered' } | { kind: 'retry'; nextRetryAt: Date } | { kind: 'failed' },
  ): Promise<void> {
    const lastError = attempt.error?.slice(0, LAST_ERROR_MAX_CHARS) ?? null;
    return this.db.withTenant(attempt.tenantId, async (tx) => {
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
