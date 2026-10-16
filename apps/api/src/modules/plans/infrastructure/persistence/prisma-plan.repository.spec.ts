import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService } from '../../../../shared/database/index.js';
import { PrismaPlanRepository } from './prisma-plan.repository.js';

describe('PrismaPlanRepository decimal serialization', () => {
  it('preserves the database scale in catalog decimal strings', async () => {
    const findMany = jest.fn(async () => [
      {
        id: 'plan-id',
        name: 'Free',
        monthly_price: new Prisma.Decimal('0.00'),
        monthly_volume_limit: new Prisma.Decimal('5000.00'),
        commission_fixed: new Prisma.Decimal('0.50'),
        commission_pct: new Prisma.Decimal('0.0350'),
        features: { webhooks: true },
      },
    ]);
    const transactionClient = {
      plan: { findMany },
    } as unknown as Prisma.TransactionClient;
    const withGlobalAccess = jest.fn(
      async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
        operation(transactionClient),
    );
    const tenantContext = {
      withGlobalAccess,
    } as unknown as PrismaTenantContextService;
    const repository = new PrismaPlanRepository(tenantContext);

    await expect(repository.findCatalog()).resolves.toEqual([
      {
        id: 'plan-id',
        name: 'Free',
        monthlyPrice: '0.00',
        monthlyVolumeLimit: '5000.00',
        commissionFixed: '0.50',
        commissionPct: '0.0350',
        features: { webhooks: true },
      },
    ]);
    expect(withGlobalAccess).toHaveBeenCalledTimes(1);
  });
});