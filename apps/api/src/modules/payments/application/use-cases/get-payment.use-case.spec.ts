import { NotFoundException } from '@nestjs/common';
import { GetPaymentUseCase } from './get-payment.use-case';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

describe('GetPaymentUseCase', () => {
  let useCase: GetPaymentUseCase;
  let withTenant: jest.Mock;
  let paymentRecord: Record<string, any>;
  let findUnique: jest.Mock;

  const tenantId = 'tenant-123';
  const paymentId = '6f1b2e34-5678-40ab-8def-1234567890aa';

  beforeEach(() => {
    paymentRecord = {
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
      qr_payload: '0002010102126304A1B2',
      bank_instructions: {
        bankName: 'Banco FrogPay Simulado',
        accountNumber: '10000012345',
        accountHolder: 'FrogPay Bolivia',
        amount: '150.00',
        currency: 'BOB',
        reference: 'BT-2026-A81F92',
      },
      expires_at: null,
      created_at: new Date('2026-10-01T14:32:10.000Z'),
      updated_at: new Date('2026-10-01T14:32:11.000Z'),
      provider: { payment_method: { code: 'card' } },
      payment_status_history: [
        {
          previous_status: null,
          new_status: 'pending',
          metadata: { actor: 'system' },
          created_at: new Date('2026-10-01T14:32:10.000Z'),
        },
        {
          previous_status: 'pending',
          new_status: 'approved',
          metadata: { actor: 'webhook' },
          created_at: new Date('2026-10-01T14:32:11.000Z'),
        },
      ],
    };
    findUnique = jest.fn().mockImplementation(({ where }) =>
      where.id_tenant_id.id === paymentId &&
      where.id_tenant_id.tenant_id === tenantId
        ? paymentRecord
        : null,
    );
    withTenant = jest.fn(async (_tenantId: string, callback: (tx: never) => Promise<unknown>) => {
      const mockTx = {
        payment: {
          findUnique,
        },
      };
      return callback(mockTx as never);
    });

    useCase = new GetPaymentUseCase({ withTenant } as unknown as PrismaTenantContextService);
  });

  it('returns payment details, transitions, and status history', async () => {
    const result = await useCase.execute(tenantId, paymentId);

    expect(result.id).toBe(paymentId);
    expect(result.status).toBe('approved');
    expect(result.amount).toBe('150.00');
    expect(result.commissionAmount).toBe('5.25');
    expect(result.netAmount).toBe('144.75');

    // Transitions
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions[0]).toEqual({
      from: null,
      to: 'pending',
      createdAt: '2026-10-01T14:32:10.000Z',
      actor: 'system',
    });
    expect(result.transitions[1]).toEqual({
      from: 'pending',
      to: 'approved',
      createdAt: '2026-10-01T14:32:11.000Z',
      actor: 'webhook',
    });

    // Como está approved, qrPayload y bankInstructions deben ser null
    expect(result.qrPayload).toBeNull();
    expect(result.bankInstructions).toBeNull();
  });

  it('returns QR payload and bank instructions when payment is pending', async () => {
    paymentRecord.status = 'pending';
    paymentRecord.provider.payment_method.code = 'qr';
    paymentRecord.qr_payload = '0002010102126304A1B2';
    paymentRecord.expires_at = new Date('2026-10-10T18:45:00.000Z');

    const result = await useCase.execute(tenantId, paymentId);

    expect(result.status).toBe('pending');
    expect(result.qrPayload).toBe('0002010102126304A1B2');
    expect(result.bankInstructions).toMatchObject({
      bankName: 'Banco FrogPay Simulado',
      accountNumber: '10000012345',
    });
    expect(result.expiresAt).toBe('2026-10-10T18:45:00.000Z');
  });

  it('throws 404 payment_not_found if payment belongs to another tenant', async () => {
    await expect(useCase.execute('other-tenant', paymentId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 payment_not_found if payment does not exist', async () => {
    await expect(useCase.execute(tenantId, 'non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
