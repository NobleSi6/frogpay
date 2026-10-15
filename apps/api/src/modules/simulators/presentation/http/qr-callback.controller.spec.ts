import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../../../shared/auth/public.decorator';
import { ApiKeyAuthGuard } from '../../../payments/presentation/guards/api-key-auth.guard';
import type { ApiKeyContext } from '../../../payments/presentation/guards/api-key-auth.guard';
import type { PaymentSimulationService } from '../../application/payment-simulation.service';
import { QrCallbackController } from './qr-callback.controller';

describe('QrCallbackController', () => {
  const apiKey: ApiKeyContext = {
    tenantId: 'd8a1d4c1-bc00-4adb-90b3-663a1c34a631',
    environment: 'sandbox',
    apiKeyId: 'key-1',
    keyPrefix: 'test-prefix',
  };
  const paymentId = 'fa6767da-8c63-4f41-9af2-90c93b55f792';
  let simulation: jest.Mocked<Pick<PaymentSimulationService, 'simulate'>>;
  let controller: QrCallbackController;

  beforeEach(() => {
    simulation = { simulate: jest.fn() };
    controller = new QrCallbackController(
      simulation as unknown as PaymentSimulationService,
    );
  });

  it('allows API-key-only authentication while retaining the API key guard', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, QrCallbackController)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, QrCallbackController)).toEqual([ApiKeyAuthGuard]);
  });

  it('passes the snake_case payment id and API-key tenant to common simulation', async () => {
    const response = { paymentId, status: 'approved', changed: true };
    simulation.simulate.mockResolvedValue(response);

    await expect(
      controller.simulateCallback(apiKey, {
        payment_id: paymentId,
        result: 'APPROVED',
      }),
    ).resolves.toEqual(response);
    expect(simulation.simulate).toHaveBeenCalledWith(
      apiKey.tenantId,
      paymentId,
      'APPROVED',
      'sandbox',
    );
  });

  it('forwards FAILED as the simulation result', async () => {
    simulation.simulate.mockResolvedValue({
      paymentId,
      status: 'rejected',
      changed: true,
    });

    await controller.simulateCallback(apiKey, {
      payment_id: paymentId,
      result: 'FAILED',
    });

    expect(simulation.simulate).toHaveBeenCalledWith(
      apiKey.tenantId,
      paymentId,
      'FAILED',
      'sandbox',
    );
  });
});
