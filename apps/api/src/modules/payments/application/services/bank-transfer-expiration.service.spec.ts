import { ConfigService } from '@nestjs/config';
import { BankTransferExpirationService } from './bank-transfer-expiration.service';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

describe('BankTransferExpirationService', () => {
  let service: BankTransferExpirationService;
  let mockPrisma: any;
  let withGlobalAccess: jest.Mock;
  let withTenant: jest.Mock;
  let configService: ConfigService;

  const tenantId = '0e21495a-7a01-4dd7-8393-6c9cd724d752';

  beforeEach(() => {
    mockPrisma = {
      payment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment_status_history: {
        create: jest.fn(),
      },
      domain_event_outbox: {
        create: jest.fn(),
      },
    };

    withGlobalAccess = jest.fn((callback) => callback(mockPrisma));
    withTenant = jest.fn((tId, callback) => callback(mockPrisma));

    const tenantContext = {
      withGlobalAccess,
      withTenant,
    } as unknown as PrismaTenantContextService;

    configService = {
      get: jest.fn(() => 60000),
    } as unknown as ConfigService;

    service = new BankTransferExpirationService(tenantContext, configService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('debe expirar pagos pendientes vencidos y emitir pago.rechazado', async () => {
    const expiredPayment = {
      id: 'pay-expired-1',
      tenant_id: tenantId,
      amount: '150.00',
      currency: 'BOB',
      environment: 'sandbox',
      merchant_reference: 'ORDEN-99',
    };

    mockPrisma.payment.findMany.mockResolvedValue([expiredPayment]);
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: 'pay-expired-1',
      tenant_id: tenantId,
      status: 'pending',
    });

    const now = new Date('2026-10-12T10:00:00.000Z');
    const expiredCount = await service.expirePendingTransfers(now);

    expect(expiredCount).toBe(1);

    // 1. Verificación de actualización de pago
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_tenant_id: { id: 'pay-expired-1', tenant_id: tenantId } },
        data: expect.objectContaining({
          status: 'rejected',
          error_code: 'transfer_expired',
        }),
      }),
    );

    // 2. Historial de estado
    expect(mockPrisma.payment_status_history.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payment_id: 'pay-expired-1',
          previous_status: 'pending',
          new_status: 'rejected',
          metadata: expect.objectContaining({
            errorCode: 'transfer_expired',
          }),
        }),
      }),
    );

    // 3. Outbox pago.rechazado
    expect(mockPrisma.domain_event_outbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'pago.rechazado',
          aggregate_id: 'pay-expired-1',
          payload: expect.objectContaining({
            paymentId: 'pay-expired-1',
            errorCode: 'transfer_expired',
          }),
        }),
      }),
    );
  });

  it('no debe hacer nada si no hay pagos vencidos', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);

    const count = await service.expirePendingTransfers();

    expect(count).toBe(0);
    expect(withTenant).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });
});
