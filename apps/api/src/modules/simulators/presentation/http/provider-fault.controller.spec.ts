import { ForbiddenException } from '@nestjs/common';
import { ValidationError } from '../../../../shared/http/errors/validation-error';
import { ProviderFaultInjector } from '../../../provider-adapters/resilience/provider-fault-injector';
import { ProviderFaultController } from './provider-fault.controller';

const sandboxKey = { tenantId: 't-1', environment: 'sandbox' } as never;
const productionKey = { tenantId: 't-1', environment: 'production' } as never;

function setup() {
  const faults = new ProviderFaultInjector();
  const providers = { supportedAdapterCodes: () => ['stripe', 'qr-local'] };
  return { controller: new ProviderFaultController(faults, providers), faults };
}

describe('ProviderFaultController (TSK-DEV2-305)', () => {
  it('activa, lista y quita una falla simulada en sandbox', () => {
    const { controller } = setup();
    const created = controller.inject(sandboxKey, { provider: 'Stripe', mode: 'error', durationSeconds: 60 });
    expect(created).toMatchObject({ provider: 'stripe', mode: 'error', latencyMs: 0 });
    expect(controller.list(sandboxKey)).toHaveLength(1);
    controller.clear(sandboxKey, 'stripe');
    expect(controller.list(sandboxKey)).toEqual([]);
  });

  it('rechaza proveedores desconocidos', () => {
    const { controller } = setup();
    expect(() => controller.inject(sandboxKey, { provider: 'paypal', mode: 'error', durationSeconds: 10 })).toThrow(ValidationError);
  });

  it('responde 403 con una API key de producción', () => {
    const { controller } = setup();
    expect(() => controller.inject(productionKey, { provider: 'stripe', mode: 'error', durationSeconds: 10 })).toThrow(
      ForbiddenException,
    );
  });
});
