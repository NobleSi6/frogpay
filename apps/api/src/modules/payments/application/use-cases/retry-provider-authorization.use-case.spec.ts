import { parseRetryDelays } from '../ports/provider-retry-scheduler.port';
import { RetryProviderAuthorizationUseCase } from './retry-provider-authorization.use-case';

const MESSAGE = {
  paymentId: 'p-1',
  tenantId: 't-1',
  paymentMethod: 'qr',
  amount: '50.00',
  currency: 'BOB',
  idempotencyKey: 'k-1',
  attempt: 2,
};

function setup(result: unknown, payment: unknown = { status: 'pending', provider_transaction_id: null }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const tenantContext = {
    withGlobalAccess: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } })),
    withTenant: jest.fn(async (_t: string, fn: (tx: unknown) => unknown) => fn({ payment: { updateMany } })),
  };
  const authorize = typeof result === 'function' ? jest.fn(result as () => unknown) : jest.fn().mockResolvedValue(result);
  const providers = { resolve: jest.fn().mockReturnValue({ authorize }) };
  const settlement = { approve: jest.fn().mockResolvedValue({}), reject: jest.fn().mockResolvedValue({}) };
  const scheduler = {
    delaysMs: [5000, 10000, 20000, 40000, 80000],
    schedule: jest.fn().mockResolvedValue(undefined),
    deadLetter: jest.fn().mockResolvedValue(undefined),
  };
  const useCase = new RetryProviderAuthorizationUseCase(tenantContext as never, providers, settlement as never, scheduler);
  return { useCase, authorize, updateMany, settlement, scheduler };
}

describe('RetryProviderAuthorizationUseCase (TSK-DEV2-305)', () => {
  it('cuando el proveedor vuelve, guarda el QR y deja el pago pendiente de confirmación', async () => {
    const expiresAt = new Date('2026-10-13T12:15:00Z');
    const { useCase, updateMany, settlement } = setup({ outcome: 'pending', providerTransactionId: 'qr-123', qrPayload: '000201...', expiresAt });
    await expect(useCase.execute(MESSAGE)).resolves.toBe('pending_confirmation');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'p-1', status: 'pending' }),
        data: expect.objectContaining({ provider_transaction_id: 'qr-123', qr_payload: '000201...', expires_at: expiresAt }),
      }),
    );
    expect(settlement.reject).not.toHaveBeenCalled();
  });

  it('si el proveedor sigue caído, programa el siguiente intento con backoff', async () => {
    const { useCase, scheduler } = setup({ outcome: 'error', errorCode: 'provider_unavailable' });
    await expect(useCase.execute({ ...MESSAGE, attempt: 3 })).resolves.toBe('retry_scheduled');
    expect(scheduler.schedule).toHaveBeenCalledWith({ ...MESSAGE, attempt: 4 }, 20000);
  });

  it('un timeout o una excepción también se reintentan', async () => {
    const { useCase, scheduler } = setup(() => Promise.reject(new Error('socket hang up')));
    await expect(useCase.execute(MESSAGE)).resolves.toBe('retry_scheduled');
    expect(scheduler.schedule).toHaveBeenCalledWith({ ...MESSAGE, attempt: 3 }, 10000);
  });

  it('agotados los reintentos rechaza con provider_unavailable y envía a la DLQ de pagos', async () => {
    const { useCase, scheduler, settlement } = setup({ outcome: 'timeout', errorCode: 'provider_timeout' });
    await expect(useCase.execute({ ...MESSAGE, attempt: 6 })).resolves.toBe('dead_lettered');
    expect(scheduler.schedule).not.toHaveBeenCalled();
    expect(settlement.reject).toHaveBeenCalledWith('p-1', 'provider_unavailable');
    expect(scheduler.deadLetter).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'p-1', reason: 'provider_timeout' }));
  });

  it('no reintenta pagos que ya no están pendientes (mensaje repetido o pago vencido)', async () => {
    const { useCase, authorize } = setup({ outcome: 'pending' }, { status: 'rejected', provider_transaction_id: null });
    await expect(useCase.execute(MESSAGE)).resolves.toBe('skipped');
    expect(authorize).not.toHaveBeenCalled();
  });

  it('un rechazo del proveedor se registra sin reintentar', async () => {
    const { useCase, settlement, scheduler } = setup({ outcome: 'declined', errorCode: 'processing_error' });
    await expect(useCase.execute(MESSAGE)).resolves.toBe('rejected');
    expect(settlement.reject).toHaveBeenCalledWith('p-1', 'processing_error');
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });
});

describe('parseRetryDelays', () => {
  it('usa 5-10-20-40-80 s por defecto y acepta una lista configurada', () => {
    expect(parseRetryDelays(undefined)).toEqual([5000, 10000, 20000, 40000, 80000]);
    expect(parseRetryDelays('1000, 2000,4000')).toEqual([1000, 2000, 4000]);
    expect(parseRetryDelays('abc,0')).toEqual([5000, 10000, 20000, 40000, 80000]);
  });
});
