import { DashboardMetricsService } from './dashboard-metrics.service';

describe('DashboardMetricsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T20:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('calcula métricas de 7 días y conserva el ambiente en consulta y caché', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        payment(
          '100.00',
          'approved',
          '2.80',
          '97.20',
          'card',
          '2026-10-17T12:00:00Z',
        ),
        payment('50.00', 'rejected', null, null, 'qr', '2026-10-16T12:00:00Z'),
        payment(
          '75.00',
          'pending',
          null,
          null,
          'bank_transfer',
          '2026-10-15T12:00:00Z',
        ),
      ]);
    const db = {
      withTenant: jest.fn(
        (_tenantId: string, callback: (tx: unknown) => unknown) =>
          callback({ payment: { findMany } }),
      ),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const service = new DashboardMetricsService(db as never, redis as never);

    const result = await service.get('tenant-1', 7, 'production');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ environment: 'production' }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        from: '2026-10-11',
        to: '2026-10-17',
        environment: 'production',
        volume: '100.00',
        transactionCount: 3,
        approvalRate: 0.5,
        commissionAmount: '2.80',
        netAmount: '97.20',
      }),
    );
    expect(result.dailySeries).toHaveLength(7);
    expect(redis.set).toHaveBeenCalledWith(
      'dashboard:metrics:v1:tenant-1:production:7:2026-10-11',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('devuelve la caché sin consultar PostgreSQL', async () => {
    const cached = { transactionCount: 9 };
    const db = { withTenant: jest.fn() };
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify(cached)),
      set: jest.fn(),
    };
    const service = new DashboardMetricsService(db as never, redis as never);
    await expect(service.get('tenant-1', 30, 'sandbox')).resolves.toEqual(
      cached,
    );
    expect(db.withTenant).not.toHaveBeenCalled();
  });
});

function payment(
  amount: string,
  status: string,
  commission: string | null,
  net: string | null,
  method: string,
  createdAt: string,
) {
  return {
    amount,
    status,
    commission_amount: commission,
    net_amount: net,
    created_at: new Date(createdAt),
    provider: { payment_method: { code: method } },
  };
}
