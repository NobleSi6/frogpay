import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ListDeliveriesQueryDto } from '../dto/webhook-endpoint.dto';

interface WebhookDeliveryRepositoryLike {
  listDeliveries?: (tenantId: string, query: ListDeliveriesQueryDto) => Promise<{ rows?: any[]; total?: number }>;
  findDelivery?: (tenantId: string, id: string) => Promise<any | null>;
  markForManualRetry?: (tenantId: string, id: string) => Promise<number | null>;
}

interface WebhookDispatchQueueLike {
  enqueue: (message: { deliveryId: string; attempt: number; manual?: boolean }, delayMs?: number) => Promise<void>;
}

@Injectable()
export class WebhookDeliveriesService {
  constructor(
    private readonly repo: WebhookDeliveryRepositoryLike,
    private readonly queue: WebhookDispatchQueueLike,
  ) {}

  async list(tenantId: string, query: ListDeliveriesQueryDto) {
    const result = this.repo.listDeliveries ? await this.repo.listDeliveries(tenantId, query) : { rows: [], total: 0 };
    const rows = (result.rows ?? []).map((row) => ({
      id: row.id,
      webhookId: row.webhook_id,
      paymentId: row.payment_id ?? null,
      eventId: row.event_id ?? null,
      eventType: row.event_type,
      status: row.status,
      responseCode: row.response_code ?? null,
      lastError: row.last_error ?? null,
      nextRetryAt: row.next_retry_at ?? null,
      deliveredAt: row.delivered_at ?? null,
      createdAt: row.created_at,
      attemptCount: row.attempt_count ?? 0,
    }));

    return {
      total: result.total ?? rows.length,
      data: rows,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? (rows.length > 0 ? rows.length : 20),
    };
  }

  async get(tenantId: string, id: string) {
    const row = this.repo.findDelivery ? await this.repo.findDelivery(tenantId, id) : null;
    if (!row) throw new NotFoundException('Webhook delivery not found');

    return {
      id: row.id,
      webhookId: row.webhook_id,
      paymentId: row.payment_id ?? null,
      eventId: row.event_id ?? null,
      eventType: row.event_type,
      status: row.status,
      responseCode: row.response_code ?? null,
      lastError: row.last_error ?? null,
      nextRetryAt: row.next_retry_at ?? null,
      deliveredAt: row.delivered_at ?? null,
      createdAt: row.created_at,
      attemptCount: row.attempt_count ?? 0,
      payload: row.payload ?? {},
      attempts: row.attempts ?? [],
    };
  }

  async retry(tenantId: string, id: string) {
    const row = this.repo.findDelivery ? await this.repo.findDelivery(tenantId, id) : null;
    if (!row) throw new NotFoundException('Webhook delivery not found');
    if (row.status !== 'failed') throw new ConflictException('invalid_state_transition');

    const nextAttempt = this.repo.markForManualRetry ? await this.repo.markForManualRetry(tenantId, id) : null;
    const attemptNumber = Number(nextAttempt ?? (row.attempt_count ?? 0) + 1);
    await this.queue.enqueue({ deliveryId: id, attempt: attemptNumber, manual: true });

    return {
      id: row.id,
      webhookId: row.webhook_id,
      paymentId: row.payment_id ?? null,
      eventId: row.event_id ?? null,
      eventType: row.event_type,
      status: 'pending',
      responseCode: row.response_code ?? null,
      lastError: row.last_error ?? null,
      nextRetryAt: null,
      deliveredAt: row.delivered_at ?? null,
      createdAt: row.created_at,
      attemptCount: attemptNumber,
    };
  }
}
