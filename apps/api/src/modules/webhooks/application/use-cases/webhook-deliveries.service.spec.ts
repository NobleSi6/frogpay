import { ConflictException, NotFoundException } from '@nestjs/common';
import { WebhookDeliveriesService } from './webhook-deliveries.service';

describe('WebhookDeliveriesService', () => {
  it('lista entregas y devuelve el estado de la última entrega', async () => {
    const repo = {
      listDeliveries: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'd-1',
            webhook_id: 'w-1',
            payment_id: 'p-1',
            event_id: 'e-1',
            event_type: 'pago.aprobado',
            status: 'failed',
            attempt_count: 2,
            response_code: 500,
            last_error: 'HTTP 500',
            next_retry_at: null,
            delivered_at: null,
            created_at: new Date('2026-10-08T00:00:00Z'),
          },
        ],
        total: 1,
      }),
      findDelivery: jest.fn().mockResolvedValue({
        id: 'd-1',
        webhook_id: 'w-1',
        payment_id: 'p-1',
        event_id: 'e-1',
        event_type: 'pago.aprobado',
        status: 'failed',
        attempt_count: 2,
        response_code: 500,
        last_error: 'HTTP 500',
        next_retry_at: null,
        delivered_at: null,
        created_at: new Date('2026-10-08T00:00:00Z'),
        payload: { eventId: 'e-1' },
        attempts: [],
      }),
      markForManualRetry: jest.fn().mockResolvedValue(3),
    };
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new WebhookDeliveriesService(repo as any, queue as any);

    const listResult = await service.list('tenant-1', { status: 'failed', paymentId: 'p-1', page: 1, pageSize: 20 });
    expect(listResult.total).toBe(1);
    expect(listResult.data[0].status).toBe('failed');

    const detail = await service.get('tenant-1', 'd-1');
    expect(detail.payload).toEqual({ eventId: 'e-1' });
  });

  it('reenvía una entrega fallida y marca el siguiente intento', async () => {
    const repo = {
      listDeliveries: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findDelivery: jest.fn().mockResolvedValue({
        id: 'd-1',
        webhook_id: 'w-1',
        payment_id: null,
        event_id: null,
        event_type: 'pago.aprobado',
        status: 'failed',
        attempt_count: 2,
        response_code: 500,
        last_error: 'HTTP 500',
        next_retry_at: null,
        delivered_at: null,
        created_at: new Date(),
        payload: { ok: false },
        attempts: [],
      }),
      markForManualRetry: jest.fn().mockResolvedValue(3),
    };
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new WebhookDeliveriesService(repo as any, queue as any);

    const result = await service.retry('tenant-1', 'd-1');
    expect(result.status).toBe('pending');
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: 'd-1', attempt: 3, manual: true });
  });

  it('rechaza reintentos cuando una entrega no está fallida', async () => {
    const repo = {
      listDeliveries: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findDelivery: jest.fn().mockResolvedValue({
        id: 'd-1',
        webhook_id: 'w-1',
        payment_id: null,
        event_id: null,
        event_type: 'pago.aprobado',
        status: 'pending',
        attempt_count: 2,
        response_code: null,
        last_error: null,
        next_retry_at: null,
        delivered_at: null,
        created_at: new Date(),
        payload: { ok: false },
        attempts: [],
      }),
      markForManualRetry: jest.fn().mockResolvedValue(null),
    };
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new WebhookDeliveriesService(repo as any, queue as any);

    await expect(service.retry('tenant-1', 'd-1')).rejects.toBeInstanceOf(ConflictException);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('lanza 404 si la entrega no existe', async () => {
    const repo = {
      listDeliveries: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findDelivery: jest.fn().mockResolvedValue(null),
      markForManualRetry: jest.fn(),
    };
    const queue = { enqueue: jest.fn() };
    const service = new WebhookDeliveriesService(repo as any, queue as any);

    await expect(service.get('tenant-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
