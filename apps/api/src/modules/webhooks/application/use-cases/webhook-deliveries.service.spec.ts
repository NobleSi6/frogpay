import { ConflictException, NotFoundException } from '@nestjs/common';
import { WebhookDeliveriesService } from './webhook-deliveries.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const DELIVERY = '55555555-5555-4555-8555-555555555555';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: DELIVERY,
  webhook_id: 'w-1',
  payment_id: 'p-1',
  event_id: 'e-1',
  event_type: 'pago.aprobado',
  status: 'failed',
  attempt_count: 6,
  response_code: 500,
  last_error: 'El endpoint respondió HTTP 500',
  next_retry_at: null,
  delivered_at: null,
  created_at: new Date('2026-10-08T00:00:00Z'),
  payload: { eventId: 'e-1' },
  attempts: [
    {
      attempt_number: 1,
      response_code: 500,
      error: 'HTTP 500',
      duration_ms: 12,
      succeeded: false,
      created_at: new Date('2026-10-08T00:00:01Z'),
    },
  ],
  ...overrides,
});

function setup() {
  const repo = {
    listDeliveries: jest.fn().mockResolvedValue({ rows: [row()], total: 1 }),
    findDelivery: jest.fn().mockResolvedValue(row()),
    markForManualRetry: jest.fn().mockResolvedValue(7),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  return { service: new WebhookDeliveriesService(repo as never, queue as never), repo, queue };
}

describe('WebhookDeliveriesService', () => {
  it('lista entregas paginadas con los filtros recibidos', async () => {
    const { service, repo } = setup();
    const result = await service.list(TENANT, { status: 'failed', paymentId: 'p-1', page: 2, pageSize: 10 });
    expect(repo.listDeliveries).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ status: 'failed', paymentId: 'p-1', page: 2, pageSize: 10 }),
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(result.data[0]).toMatchObject({ id: DELIVERY, status: 'failed', attemptCount: 6 });
  });

  it('el detalle incluye el payload enviado y cada intento', async () => {
    const { service } = setup();
    const detail = await service.get(TENANT, DELIVERY);
    expect(detail.payload).toEqual({ eventId: 'e-1' });
    expect(detail.attempts).toEqual([
      expect.objectContaining({ attemptNumber: 1, responseCode: 500, succeeded: false }),
    ]);
  });

  it('reenvía manualmente una entrega fallida con el siguiente número de intento', async () => {
    const { service, queue } = setup();
    const result = await service.retry(TENANT, DELIVERY);
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: DELIVERY, attempt: 7, manual: true });
    expect(result.status).toBe('pending');
  });

  it('no permite reenviar entregas que no están fallidas', async () => {
    const { service, repo, queue } = setup();
    repo.markForManualRetry.mockResolvedValue(null);
    await expect(service.retry(TENANT, DELIVERY)).rejects.toBeInstanceOf(ConflictException);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('responde 404 si la entrega no existe o es de otro tenant', async () => {
    const { service, repo } = setup();
    repo.findDelivery.mockResolvedValue(null);
    await expect(service.get(TENANT, DELIVERY)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.retry(TENANT, DELIVERY)).rejects.toBeInstanceOf(NotFoundException);
  });
});
