import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import type { PaymentSettlementService } from '../../payments/application/use-cases/payment-settlement.service';
import { PaymentSimulationService } from './payment-simulation.service';

describe('PaymentSimulationService', () => {
  const tenantId = 'd8a1d4c1-bc00-4adb-90b3-663a1c34a631';
  const paymentId = 'fa6767da-8c63-4f41-9af2-90c93b55f792';
  let payment: Record<string, unknown>;
  let context: { withGlobalAccess: jest.Mock };
  let settlement: {
    approve: jest.Mock;
    reject: jest.Mock;
  };
  let config: { get: jest.Mock };
  let service: PaymentSimulationService;

  beforeEach(() => {
    payment = {
      id: paymentId,
      tenant_id: tenantId,
      status: 'pending',
      environment: 'sandbox',
      expires_at: new Date(Date.now() + 60_000),
      qr_payload: 'qr-payload',
      provider: { payment_method: { code: 'qr' } },
    };
    context = {
      withGlobalAccess: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          payment: {
            findUnique: jest.fn(async () => payment),
          },
        }),
      ),
    };
    settlement = {
      approve: jest.fn().mockResolvedValue({
        outcome: 'changed',
        paymentId,
        status: 'approved',
      }),
      reject: jest.fn().mockResolvedValue({
        outcome: 'changed',
        paymentId,
        status: 'rejected',
      }),
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'nodeEnv' ? 'test' : key === 'qrSimulatorsEnabled' ? true : undefined,
      ),
    };
    service = new PaymentSimulationService(
      context as unknown as PrismaTenantContextService,
      settlement as unknown as PaymentSettlementService,
      config as unknown as ConfigService,
    );
  });

  it('approves a pending sandbox QR payment through settlement', async () => {
    await expect(service.simulate(tenantId, paymentId, 'APPROVED')).resolves.toEqual({
      paymentId,
      status: 'approved',
      changed: true,
    });
    expect(settlement.approve).toHaveBeenCalledWith(paymentId);
    expect(settlement.reject).not.toHaveBeenCalled();
  });

  it('rejects a pending sandbox QR payment with processing_error', async () => {
    await expect(service.simulate(tenantId, paymentId, 'FAILED')).resolves.toEqual({
      paymentId,
      status: 'rejected',
      changed: true,
    });
    expect(settlement.reject).toHaveBeenCalledWith(paymentId, 'processing_error');
  });

  it('returns the current status without settlement when payment is already terminal', async () => {
    payment.status = 'approved';

    await expect(service.simulate(tenantId, paymentId, 'APPROVED')).resolves.toEqual({
      paymentId,
      status: 'approved',
      changed: false,
    });
    expect(settlement.approve).not.toHaveBeenCalled();
  });

  it('does not settle an expired pending QR payment', async () => {
    payment.expires_at = new Date(Date.now() - 1);

    await expect(service.simulate(tenantId, paymentId, 'APPROVED')).resolves.toEqual({
      paymentId,
      status: 'pending',
      changed: false,
    });
    expect(settlement.approve).not.toHaveBeenCalled();
  });

  it('hides payments belonging to another tenant', async () => {
    payment.tenant_id = 'bb684e20-28d9-4a85-889e-2ccf73a5e9f3';

    await expect(service.simulate(tenantId, paymentId, 'APPROVED')).rejects.toThrow(
      NotFoundException,
    );
    expect(settlement.approve).not.toHaveBeenCalled();
  });

  it('rejects production payments and production API keys', async () => {
    payment.environment = 'production';
    await expect(service.simulate(tenantId, paymentId, 'APPROVED')).rejects.toThrow(
      ForbiddenException,
    );

    payment.environment = 'sandbox';
    await expect(
      service.simulate(tenantId, paymentId, 'APPROVED', 'production'),
    ).rejects.toThrow(ForbiddenException);
    expect(settlement.approve).not.toHaveBeenCalled();
  });

  it('rejects simulation when deployment configuration disables it', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'nodeEnv' ? 'production' : key === 'qrSimulatorsEnabled' ? true : undefined,
    );

    await expect(service.simulate(tenantId, paymentId, 'APPROVED')).rejects.toThrow(
      ForbiddenException,
    );
    expect(settlement.approve).not.toHaveBeenCalled();
  });
});
