import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { InvalidTenantContextError } from './invalid-tenant-context.error';
import {
    PrismaTenantContextService,
    TenantTx,
} from './prisma-tenant-context.service';
import { PrismaService } from './prisma.service';

describe('PrismaTenantContextService', () => {
  const tenantId = '2c1b4e4f-6d5a-4f84-9a88-8e4650b0a321';

  function createService() {
    const queryRaw = jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]);
    const tx = { $queryRaw: queryRaw } as unknown as TenantTx;
    const transaction = jest.fn(
      async (operation: (transaction: TenantTx) => Promise<unknown>) =>
        operation(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const configService = {
      getOrThrow: (key: string) =>
        ({ PRISMA_TX_TIMEOUT_MS: 5000, PRISMA_TX_MAX_WAIT_MS: 2000 })[key],
    } as unknown as ConfigService;

    return {
      service: new PrismaTenantContextService(prisma, configService),
      transaction,
      queryRaw,
    };
  }

  function expectContextParameters(
    queryRaw: jest.Mock,
    expectedTenantId: string,
    expectedGlobalAccess: string,
  ): void {
    const [query, tenantValue, globalAccessValue] = queryRaw.mock
      .calls[0] as unknown as [TemplateStringsArray, string, string];
    const sql = query.join('?');

    expect(sql).toContain("set_config('app.current_tenant_id', ?, true)");
    expect(sql).toContain("set_config('app.global_access', ?, true)");
    expect(tenantValue).toBe(expectedTenantId);
    expect(globalAccessValue).toBe(expectedGlobalAccess);
  }

  it('rejects an invalid UUID before opening a transaction', async () => {
    const { service, transaction } = createService();

    await expect(
      service.withTenant('not-a-uuid', async () => 'unused'),
    ).rejects.toThrow(InvalidTenantContextError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('sets the tenant id and disables global access', async () => {
    const { service, queryRaw } = createService();

    await service.withTenant(tenantId, async () => 'done');

    expectContextParameters(queryRaw, tenantId, 'false');
  });

  it('sets an empty tenant id and enables global access', async () => {
    const { service, queryRaw } = createService();

    await service.withGlobalAccess(async () => 'done');

    expectContextParameters(queryRaw, '', 'true');
  });

  it('returns the value produced by the transaction callback', async () => {
    const { service } = createService();

    await expect(service.withTenant(tenantId, async () => 'result')).resolves.toBe(
      'result',
    );
  });

  it('propagates callback errors unchanged', async () => {
    const { service } = createService();
    const error = new Error('database work failed');

    await expect(
      service.withTenant(tenantId, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
