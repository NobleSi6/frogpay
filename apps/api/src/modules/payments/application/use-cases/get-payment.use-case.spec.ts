import { NotFoundException } from '@nestjs/common';
import { GetPaymentUseCase } from './get-payment.use-case';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

describe('GetPaymentUseCase', () => {
  let useCase: GetPaymentUseCase;
  let withTenant: jest.Mock;

  const tenantId = 'tenant-123';
  const paymentId = 'pay-456';

  beforeEach(() => {
    withTenant = jest.fn(async (_tenantId: string, callback: (tx: never) => Promise<unknown>) => {
      const mockTx = {
        payment: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (
              where.id_tenant_id.id === paymentId &&
              where.id_tenant_id.tenant_id === tenantId
            ) {
              return {
                id: paymentId,
                tenant_id: tenantId,
                amount: '150.00',
                currency: 'BOB',
                status: 'approved',
                environment: 'sandbox',
                merchant_reference: 'ref-1',
                commission_amount: '5.25',
                net_amount: '144.75',
                provider_transaction_id: 'pi_test123',
                error_code: null,
                created_at: new Date('2026-10-01T14:32:10.000Z'),
                updated_at: new Date('2026-10-01T14:32:11.000Z'),
                payment_method: { code: 'card' },
                payment_status_history: [
                  {
                    previous_status: null,
                    new_status: 'pending',
                    metadata: {},
                    created_at: new Date('2026-10-01T14:32:10.000Z'),
                  },
                  {
                    previous_status: 'pending',
                    new_status: 'approved',
                    metadata: {},
                    created_at: new Date('2026-10-01T14:32:11.000Z'),
                  },
                ],
              };
            }
            return null;
          }),
        },
      };
      return callback(mockTx as never);
    });

    useCase = new GetPaymentUseCase({ withTenant } as unknown as PrismaTenantContextService);
  });

  it('returns payment details and chronological status history', async () => {
    const result = await useCase.execute(tenantId, paymentId);

    expect(result.id).toBe(paymentId);
    expect(result.status).toBe('approved');
    expect(result.amount).toBe('150.00');
    expect(result.statusHistory).toHaveLength(2);
    expect(result.statusHistory[0].newStatus).toBe('pending');
    expect(result.statusHistory[1].newStatus).toBe('approved');
  });

  it('throws 404 payment_not_found if payment does not exist or belongs to another tenant', async () => {
    await expect(useCase.execute('other-tenant', paymentId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
