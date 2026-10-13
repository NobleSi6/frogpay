import { Injectable } from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { WebhookEnvelope } from '../../domain/webhook-envelope';

export interface WebhookEndpointRecord {
  id: string;
  url: string;
  eventTypes: string[];
  environment: 'sandbox' | 'production';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryListFilters {
  status?: string;
  paymentId?: string;
  webhookId?: string;
  page: number;
  pageSize: number;
}

const endpointSelect = {
  id: true,
  url: true,
  event_types: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

type EndpointRow = {
  id: string;
  url: string;
  event_types: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at?: Date | null;
  environment?: 'sandbox' | 'production';
};

function toRecord(row: EndpointRow): WebhookEndpointRecord {
  return {
    id: row.id,
    url: row.url,
    eventTypes: Array.isArray(row.event_types) ? (row.event_types as string[]) : [],
    environment: row.environment ?? 'sandbox',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

@Injectable()
export class WebhookEndpointRepository {
  constructor(private readonly db: PrismaTenantContextService) {}

  create(
    tenantId: string,
    input: { url: string; eventTypes: string[]; environment: string; secretEncrypted: string },
  ) {
    return this.db.withTenant(tenantId, async (tx) =>
      toRecord({
        ...(await tx.webhook.create({
          data: {
            tenant_id: tenantId,
            url: input.url,
            event_types: input.eventTypes,
            secret_encrypted: input.secretEncrypted,
            is_active: true,
          },
          select: endpointSelect,
        })),
        environment: input.environment as 'sandbox' | 'production',
      }),
    );
  }

  list(tenantId: string): Promise<WebhookEndpointRecord[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await tx.webhook.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        select: endpointSelect,
      });
      return rows.map((row: EndpointRow) => toRecord({ ...row, environment: 'sandbox' }));
    });
  }

  findById(tenantId: string, id: string): Promise<WebhookEndpointRecord | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.webhook.findFirst({
        where: { id, tenant_id: tenantId },
        select: endpointSelect,
      });
      return row ? toRecord({ ...row, environment: 'sandbox' }) : null;
    });
  }

  update(
    tenantId: string,
    id: string,
    changes: { url?: string; eventTypes?: string[]; isActive?: boolean; secretEncrypted?: string; deleted?: boolean },
  ): Promise<WebhookEndpointRecord | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const data: Record<string, unknown> = {
        updated_at: new Date(),
        ...(changes.url !== undefined && { url: changes.url }),
        ...(changes.eventTypes !== undefined && { event_types: changes.eventTypes }),
        ...(changes.isActive !== undefined && { is_active: changes.deleted ? false : changes.isActive }),
        ...(changes.secretEncrypted !== undefined && { secret_encrypted: changes.secretEncrypted }),
      };

      const result = await tx.webhook.updateMany({
        where: { id, tenant_id: tenantId },
        data,
      });
      if (result.count === 0) return null;
      const row = await tx.webhook.findFirst({ where: { id, tenant_id: tenantId }, select: endpointSelect });
      return row ? toRecord({ ...row, environment: 'sandbox' }) : null;
    });
  }

  createTestDelivery(tenantId: string, webhookId: string, envelope: WebhookEnvelope): Promise<string> {
    return this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.webhook_delivery.create({
        data: {
          webhook_id: webhookId,
          tenant_id: tenantId,
          event_type: envelope.eventName,
          payload: envelope as unknown as Record<string, unknown>,
          status: 'pending',
          next_retry_at: new Date(),
        },
        select: { id: true },
      });
      return row.id;
    });
  }

  listDeliveries(tenantId: string, filters: DeliveryListFilters) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.paymentId ? { payment_id: filters.paymentId } : {}),
      ...(filters.webhookId ? { webhook_id: filters.webhookId } : {}),
    };

    return this.db.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.webhook_delivery.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        tx.webhook_delivery.count({ where }),
      ]);
      return { rows, total };
    });
  }

  findDelivery(tenantId: string, deliveryId: string) {
    return this.db.withTenant(tenantId, async (tx) =>
      tx.webhook_delivery.findFirst({
        where: { id: deliveryId, tenant_id: tenantId },
      }),
    );
  }

  markForManualRetry(tenantId: string, deliveryId: string, leaseMs: number): Promise<number | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const current = await tx.webhook_delivery.findFirst({
        where: { id: deliveryId, tenant_id: tenantId },
        select: { attempt_count: true, status: true },
      });
      if (!current || !['failed', 'dead_letter'].includes(current.status)) return null;

      const result = await tx.webhook_delivery.updateMany({
        where: { id: deliveryId, tenant_id: tenantId, status: current.status, attempt_count: current.attempt_count },
        data: { status: 'pending', next_retry_at: new Date(Date.now() + leaseMs), updated_at: new Date() },
      });
      return result.count === 1 ? current.attempt_count + 1 : null;
    });
  }
}
