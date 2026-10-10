import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { PaymentSettlementService } from './payment-settlement.service';

describe('PaymentSettlementService', () => {
  let service: PaymentSettlementService;
  let payment: Record<string, any>;
  let histories: any[];
  let events: any[];
  let usage: any;
  let tx: Record<string, any>;
  let withGlobalAccess: jest.Mock;
  let failOutbox: boolean;

  const paymentId = 'c31d6a11-c1e7-48bd-b7ce-b59ee3f5e081';

  beforeEach(() => {
    payment = {
      id: paymentId,
      tenant_id: '0e21495a-7a01-4dd7-8393-6c9cd724d752',
      amount: '100.00',
      currency: 'BOB',
      status: 'pending',
      environment: 'sandbox',
      merchant_reference: 'orden-qr-1',
      provider_transaction_id: 'FP0123456789ABCDEF',
      provider: { payment_method: { code: 'qr' } },
      tenant: {
        plan: { commission_fixed: '0.50', commission_pct: '0.0350' },
      },
    };
    histories = [];
    events = [];
    usage = null;
    failOutbox = false;
    tx = {
      payment: {
        findUnique: jest.fn(async () => payment),
        updateMany: jest.fn(async ({ where, data }) => {
          if (payment.id !== where.id || payment.status !== where.status) return { count: 0 };
          payment = { ...payment, ...data };
          return { count: 1 };
        }),
      },
      payment_status_history: {
        create: jest.fn(async ({ data }) => {
          histories.push(data);
          return data;
        }),
      },
      domain_event_outbox: {
        create: jest.fn(async ({ data }) => {
          if (failOutbox) throw new Error('outbox unavailable');
          events.push(data);
          return data;
        }),
      },
      tenant_plan_usage: {
        upsert: jest.fn(async ({ create }) => {
          usage = create;
          return usage;
        }),
      },
    };
    withGlobalAccess = jest.fn(async (callback: (transaction: never) => Promise<unknown>) => {
      const originalPayment = { ...payment };
      const originalHistories = [...histories];
      const originalEvents = [...events];
      const originalUsage = usage;
      try {
        return await callback(tx as never);
      } catch (error) {
        payment = originalPayment;
        histories = originalHistories;
        events = originalEvents;
        usage = originalUsage;
        throw error;
      }
    });
    service = new PaymentSettlementService({
      withGlobalAccess,
    } as unknown as PrismaTenantContextService);
  });

  it('approves pending payment with calculated commission, history, usage, and outbox event', async () => {
    await expect(service.approve(paymentId)).resolves.toEqual({
      outcome: 'changed',
      paymentId,
      status: 'approved',
    });
    expect(payment).toMatchObject({
      status: 'approved',
      commission_amount: '4.00',
      net_amount: '96.00',
    });
    expect(histories).toEqual([
      expect.objectContaining({ previous_status: 'pending', new_status: 'approved' }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        event_type: 'pago.aprobado',
        payload: expect.objectContaining({
          commissionAmount: '4.00',
          netAmount: '96.00',
          providerTransactionId: 'FP0123456789ABCDEF',
        }),
      }),
    ]);
    expect(usage).toMatchObject({ volume_used: 100, tx_count: 1 });
  });

  it('rejects pending payment with qr_expired and writes history and outbox atomically', async () => {
    await expect(service.reject(paymentId, 'qr_expired')).resolves.toEqual({
      outcome: 'changed',
      paymentId,
      status: 'rejected',
    });
    expect(payment).toMatchObject({ status: 'rejected', error_code: 'qr_expired' });
    expect(histories).toEqual([
      expect.objectContaining({
        previous_status: 'pending',
        new_status: 'rejected',
        metadata: { errorCode: 'qr_expired' },
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        event_type: 'pago.rechazado',
        payload: expect.objectContaining({ errorCode: 'qr_expired' }),
      }),
    ]);
    expect(usage).toBeNull();
  });

  it('is idempotent when called again after a successful settlement', async () => {
    await service.approve(paymentId);
    await expect(service.approve(paymentId)).resolves.toEqual({
      outcome: 'unchanged',
      paymentId,
      reason: 'not_pending',
    });
    expect(events).toHaveLength(1);
    expect(histories).toHaveLength(1);
  });

  it('does not update, emit events, or create history for a non-pending payment', async () => {
    payment.status = 'rejected';

    await expect(service.approve(paymentId)).resolves.toEqual({
      outcome: 'unchanged',
      paymentId,
      reason: 'not_pending',
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
    expect(histories).toHaveLength(0);
  });

  it('rolls back payment state and history if outbox creation fails', async () => {
    failOutbox = true;

    await expect(service.approve(paymentId)).rejects.toThrow('outbox unavailable');
    expect(payment.status).toBe('pending');
    expect(payment.commission_amount).toBeUndefined();
    expect(histories).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(usage).toBeNull();
  });

  it('returns an explicit unchanged result for an unknown payment id', async () => {
    tx.payment.findUnique.mockResolvedValue(null);

    await expect(service.approve(paymentId)).resolves.toEqual({
      outcome: 'unchanged',
      paymentId,
      reason: 'not_found',
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });
});
