import { Logger } from '@nestjs/common';
import { MockPaymentProviderAdapter } from './adapters/mock/mock-payment-provider.adapter';
import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';
import { getPaymentProviderAdapters } from './provider-adapters.config';
import { PaymentProviderPort, ProviderResult } from './ports/payment-provider.port';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';

function buildRegistry(mockAdapterEnabled: boolean): PaymentProviderRegistry {
  const stripe: PaymentProviderPort = {
    metadata: {
      id: 'stripe',
      displayName: 'Stripe',
      methods: [
        {
          code: 'card',
          label: 'Tarjeta',
          processingMode: 'synchronous',
          requiresPaymentToken: true,
          fees: { fixedAmount: '0.30', variableBps: 290, currency: 'USD' },
        },
      ],
    },
    authorize: async (): Promise<ProviderResult> => ({ outcome: 'approved' }),
    capture: async (): Promise<ProviderResult> => ({ outcome: 'approved' }),
    queryStatus: async (): Promise<ProviderResult> => ({ outcome: 'approved' }),
  };
  const mock = new MockPaymentProviderAdapter();
  const registrations = getPaymentProviderAdapters('test', mockAdapterEnabled).map((Adapter) => {
    const adapter = Adapter === MockPaymentProviderAdapter ? mock : stripe;
    return { adapterCode: adapter.metadata.id, adapter };
  });

  return new PaymentProviderRegistry(registrations, [
    { paymentMethod: 'card', adapterCode: mockAdapterEnabled ? 'mock' : 'stripe' },
  ]);
}

describe('getPaymentProviderAdapters', () => {
  it('does not register the mock adapter when its flag is disabled', () => {
    expect(getPaymentProviderAdapters('development', false)).toEqual([
      StripePaymentProviderAdapter,
    ]);
  });

  it('registers the mock adapter only when its flag is enabled outside production', () => {
    expect(getPaymentProviderAdapters('development')).toEqual([
      StripePaymentProviderAdapter,
    ]);
    expect(getPaymentProviderAdapters('development', true)).toEqual([
      StripePaymentProviderAdapter,
      MockPaymentProviderAdapter,
    ]);
    expect(getPaymentProviderAdapters('test', true)).toEqual([
      StripePaymentProviderAdapter,
      MockPaymentProviderAdapter,
    ]);
  });

  it('ignores the mock flag in production and logs a warning', () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(getPaymentProviderAdapters('production', true)).toEqual([
      StripePaymentProviderAdapter,
    ]);

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('PAYMENT_MOCK_ADAPTER_ENABLED=true se ignora en producción'),
    );
    warning.mockRestore();
  });

  it('does not log a warning in production when the mock flag is disabled', () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(getPaymentProviderAdapters('production', false)).toEqual([
      StripePaymentProviderAdapter,
    ]);
    expect(warning).not.toHaveBeenCalled();

    warning.mockRestore();
  });

  it('does not resolve mock through the registry when the flag is off', () => {
    const registry = buildRegistry(false);

    expect(registry.supportedAdapterCodes()).toEqual(['stripe']);
    expect(registry.resolve('card').metadata.id).toBe('stripe');
  });

  it('resolves the mock through the registry when the flag is on', () => {
    const registry = buildRegistry(true);

    expect(registry.supportedAdapterCodes()).toEqual(['mock', 'stripe']);
    expect(registry.resolve('card')).toBeInstanceOf(MockPaymentProviderAdapter);
  });
});
