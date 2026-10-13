import { Injectable } from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

export const DELIVERY_LEASE_MS = 30_000;

@Injectable()
export class WebhookDeliveryRepository {
  constructor(private readonly db: PrismaTenantContextService) {}

  async saveDelivery(tenantId: string, webhookId: string, payload: Record<string, unknown>, eventType: string): Promise<string> {
    const row = await this.db.withTenant(tenantId, async (tx) =>
      tx.webhook_delivery.create({
        data: {
          webhook_id: webhookId,
          tenant_id: tenantId,
          event_type: eventType,
          payload: payload as any,
          status: 'pending',
          next_retry_at: new Date(),
        },
        select: { id: true },
      }),
    );
    return row.id;
  }
}
