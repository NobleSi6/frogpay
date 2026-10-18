import { ListPaymentsUseCase } from './list-payments.use-case';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

describe('ListPaymentsUseCase', () => {
  let useCase: ListPaymentsUseCase;
  let withTenant: jest.Mock;
  let countMock: jest.Mock;
  let findManyMock: jest.Mock;

  const tenantId = 'tenant-123';

  const mockPaymentRow = {
    id: '6f1b2e34-5678-40ab-8def-1234567890aa',
    tenant_id: tenantId,
    amount: '150.00',
    currency: 'BOB',
    status: 'approved',
    environment: 'sandbox',
    merchant_reference: 'ORDEN-1001',
    commission_amount: '1.50',
    net_amount: '148.50',
    provider_transaction_id: 'pi_test123',
    error_code: null,
    qr_payload: null,
    expires_at: null,
    created_at: new Date('2026-10-15T10:00:00.000Z'),
    updated_at: new Date('2026-10-15T10:01:00.000Z'),
    provider: {
      payment_method: {
        code: 'card',
      },
    },
  };

  beforeEach(() => {
    countMock = jest.fn().mockResolvedValue(1);
    findManyMock = jest.fn().mockResolvedValue([mockPaymentRow]);

    withTenant = jest.fn(async (_tenantId: string, callback: (tx: any) => Promise<unknown>) => {
      const mockTx = {
        payment: {
          count: countMock,
          findMany: findManyMock,
        },
      };
      return callback(mockTx);
    });

    useCase = new ListPaymentsUseCase({ withTenant } as unknown as PrismaTenantContextService);
  });

  it('lists payments with default pagination and tenant filtering', async () => {
    const result = await useCase.execute(tenantId, {
      page: 1,
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(mockPaymentRow.id);
    expect(result.data[0].paymentMethod).toBe('card');
    expect((result.data[0] as any).qrPayload).toBeUndefined();
    expect((result.data[0] as any).bankInstructions).toBeUndefined();
    expect((result.data[0] as any).transitions).toBeUndefined();

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: tenantId }),
        skip: 0,
        take: 25,
        orderBy: { created_at: 'desc' },
      }),
    );
  });

  it('applies filters by status, environment, paymentMethod, and date range', async () => {
    await useCase.execute(tenantId, {
      page: 2,
      limit: 10,
      status: 'approved',
      environment: 'production',
      paymentMethod: 'qr',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-16T00:00:00.000Z',
      sortBy: 'amount',
      sortOrder: 'asc',
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: tenantId,
          status: 'approved',
          environment: 'production',
          provider: {
            payment_method: {
              code: 'qr',
            },
          },
          created_at: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lt: new Date('2026-10-16T00:00:00.000Z'),
          },
        }),
        skip: 10,
        take: 10,
        orderBy: { amount: 'asc' },
      }),
    );
  });

  it('applies search by text or UUID', async () => {
    const searchUuid = '6f1b2e34-5678-40ab-8def-1234567890aa';
    await useCase.execute(tenantId, {
      page: 1,
      limit: 25,
      search: searchUuid,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: tenantId,
          OR: [
            { merchant_reference: { contains: searchUuid, mode: 'insensitive' } },
            { id: searchUuid },
          ],
        }),
      }),
    );
  });

  it('propagates expired and refunded statuses to Prisma where clause', async () => {
    await useCase.execute(tenantId, {
      page: 1,
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: 'expired',
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: tenantId,
          status: 'expired',
        }),
      }),
    );

    await useCase.execute(tenantId, {
      page: 1,
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: 'refunded',
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: tenantId,
          status: 'refunded',
        }),
      }),
    );
  });
});
