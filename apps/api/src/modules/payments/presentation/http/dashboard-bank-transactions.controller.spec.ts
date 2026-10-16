import { DashboardBankTransactionsController } from './dashboard-bank-transactions.controller';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';

describe('DashboardBankTransactionsController', () => {
  let controller: DashboardBankTransactionsController;
  let mockPrisma: any;
  let withTenant: jest.Mock;

  const authContext: AuthenticatedTenantContext = {
    userId: 'user-123',
    role: 'OWNER',
    tenantId: 'tenant-456',
  };

  beforeEach(() => {
    mockPrisma = {
      bank_transaction: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bt-1',
            tenant_id: 'tenant-456',
            reference: 'BT-2026-REF1',
            amount: '150.00',
            currency: 'BOB',
            bank_name: 'Banco Ganadero',
            received_at: new Date('2026-10-11T20:00:00.000Z'),
            status: 'reconciled',
            payment_id: 'pay-1',
            created_at: new Date('2026-10-11T20:00:01.000Z'),
          },
          {
            id: 'bt-2',
            tenant_id: 'tenant-456',
            reference: 'BT-2026-REF2',
            amount: '50.00',
            currency: 'BOB',
            bank_name: 'Banco Bisa',
            received_at: new Date('2026-10-11T21:00:00.000Z'),
            status: 'unmatched',
            payment_id: null,
            created_at: new Date('2026-10-11T21:00:01.000Z'),
          },
        ]),
      },
    };

    withTenant = jest.fn((tId, callback) => callback(mockPrisma));

    const tenantContext = {
      withTenant,
    } as unknown as PrismaTenantContextService;

    controller = new DashboardBankTransactionsController(tenantContext);
  });

  it('debe devolver la lista paginada de transacciones del tenant autenticado', async () => {
    const result = await controller.listTransactions(authContext, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].reference).toBe('BT-2026-REF1');
    expect(result.data[0].status).toBe('reconciled');
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.totalPages).toBe(1);

    expect(mockPrisma.bank_transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: 'tenant-456' }),
        take: 20,
        skip: 0,
      }),
    );
  });

  it('debe mapear el filtro reference_not_found a unmatched en base de datos', async () => {
    await controller.listTransactions(authContext, {
      page: 1,
      limit: 10,
      status: 'reference_not_found',
    });

    expect(mockPrisma.bank_transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'tenant-456',
          status: 'unmatched',
        }),
      }),
    );
  });
});
