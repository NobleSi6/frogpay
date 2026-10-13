import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { PaymentSimulationService } from '../../application/payment-simulation.service';
import { DashboardPaymentSimulationController } from './dashboard-payment-simulation.controller';

describe('DashboardPaymentSimulationController', () => {
  const context: AuthenticatedTenantContext = {
    tenantId: 'd8a1d4c1-bc00-4adb-90b3-663a1c34a631',
    userId: 'owner-1',
    role: 'OWNER',
  };
  const paymentId = 'fa6767da-8c63-4f41-9af2-90c93b55f792';
  let simulation: jest.Mocked<Pick<PaymentSimulationService, 'simulate'>>;
  let controller: DashboardPaymentSimulationController;

  beforeEach(() => {
    simulation = { simulate: jest.fn() };
    controller = new DashboardPaymentSimulationController(
      simulation as unknown as PaymentSimulationService,
    );
  });

  it('delegates the tenant-scoped result to the common simulator', async () => {
    const response = { paymentId, status: 'approved', changed: true };
    simulation.simulate.mockResolvedValue(response);

    await expect(
      controller.simulate(context, paymentId, { result: 'APPROVED' }),
    ).resolves.toEqual(response);
    expect(simulation.simulate).toHaveBeenCalledWith(
      context.tenantId,
      paymentId,
      'APPROVED',
    );
  });

  it('rejects malformed payment ids before calling the simulator', async () => {
    await expect(
      controller.simulate(context, 'not-a-uuid', { result: 'APPROVED' }),
    ).rejects.toThrow(BadRequestException);
    expect(simulation.simulate).not.toHaveBeenCalled();
  });
});
