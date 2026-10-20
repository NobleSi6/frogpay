import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WebhookDispatchQueue } from '../../infrastructure/messaging/webhook-dispatch.queue';
import { DELIVERY_LEASE_MS } from '../../infrastructure/persistence/webhook-delivery.repository';
import { WebhookEndpointRepository } from '../../infrastructure/persistence/webhook-endpoint.repository';
import {
  ListDeliveriesQueryDto,
  PaginatedWebhookDeliveriesDto,
  WebhookDeliveryDetailResponseDto,
  WebhookDeliveryResponseDto,
} from '../dto/webhook-endpoint.dto';

type DeliveryRow = {
  id: string;
  webhook_id: string;
  webhook: { url: string };
  payment_id: string | null;
  event_id: string | null;
  event_type: string;
  status: string;
  attempt_count: number;
  response_code: number | null;
  last_error: string | null;
  next_retry_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
};

/** Historial de entregas y reenvío manual (TSK-DEV2-302 / TSK-DEV2-303). */
@Injectable()
export class WebhookDeliveriesService {
  constructor(
    private readonly endpoints: WebhookEndpointRepository,
    private readonly queue: WebhookDispatchQueue,
  ) {}

  async list(tenantId: string, query: ListDeliveriesQueryDto): Promise<PaginatedWebhookDeliveriesDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { rows, total } = await this.endpoints.listDeliveries(tenantId, {
      status: query.status,
      paymentId: query.paymentId,
      webhookId: query.webhookId,
      page,
      pageSize,
    });
    return { data: rows.map(toDelivery), page, pageSize, total };
  }

  async get(tenantId: string, deliveryId: string): Promise<WebhookDeliveryDetailResponseDto> {
    const row = await this.endpoints.findDelivery(tenantId, deliveryId);
    if (!row) this.notFound();
    return {
      ...toDelivery(row!),
      payload: row!.payload as Record<string, unknown>,
      attempts: row!.attempts.map((attempt) => ({
        attemptNumber: attempt.attempt_number,
        responseCode: attempt.response_code,
        error: attempt.error,
        durationMs: attempt.duration_ms,
        succeeded: attempt.succeeded,
        createdAt: attempt.created_at.toISOString(),
      })),
    };
  }

  /** Reenvía una entrega fallida: un intento manual que queda registrado en el historial. */
  async retry(tenantId: string, deliveryId: string): Promise<WebhookDeliveryResponseDto> {
    const exists = await this.endpoints.findDelivery(tenantId, deliveryId);
    if (!exists) this.notFound();

    const attempt = await this.endpoints.markForManualRetry(tenantId, deliveryId, DELIVERY_LEASE_MS);
    if (attempt === null) {
      throw new ConflictException({
        code: 'invalid_state_transition',
        message: 'Solo se pueden reenviar entregas en estado fallido.',
      });
    }
    await this.queue.enqueue({ deliveryId, attempt, manual: true });
    return { ...toDelivery(exists!), status: 'pending' };
  }

  private notFound(): never {
    throw new NotFoundException({ code: 'not_found', message: 'No existe una entrega de webhook con ese identificador.' });
  }
}

function toDelivery(row: DeliveryRow): WebhookDeliveryResponseDto {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    webhookUrl: row.webhook.url,
    paymentId: row.payment_id,
    eventId: row.event_id,
    eventType: row.event_type,
    status: row.status === 'dead_letter' ? 'failed' : row.status,
    attemptCount: row.attempt_count,
    responseCode: row.response_code,
    lastError: row.last_error,
    nextRetryAt: row.next_retry_at?.toISOString() ?? null,
    deliveredAt: row.delivered_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
