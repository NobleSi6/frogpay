import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BankTransferLocalAdapter } from './adapters/bank-transfer/bank-transfer.adapter';
import { MockPaymentProviderAdapter } from './adapters/mock/mock-payment-provider.adapter';
import { QRLocalPaymentProviderAdapter } from './adapters/qr-local/qr-local-payment-provider.adapter';
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
  const qrLocal = new QRLocalPaymentProviderAdapter();
  const bankTransfer = new BankTransferLocalAdapter({
    get: jest.fn(),
  } as unknown as ConfigService);
  const registrations = getPaymentProviderAdapters('test', mockAdapterEnabled).map((Adapter) => {
    const adapter =
      Adapter === MockPaymentProviderAdapter
        ? mock
        : Adapter === QRLocalPaymentProviderAdapter
          ? qrLocal
          : Adapter === BankTransferLocalAdapter
            ? bankTransfer
            : stripe;
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
      QRLocalPaymentProviderAdapter,
      BankTransferLocalAdapter,
    ]);
  });

  it('registers the mock adapter only when its flag is enabled outside production', () => {
    expect(getPaymentProviderAdapters('development')).toEqual([
      StripePaymentProviderAdapter,
      QRLocalPaymentProviderAdapter,
      BankTransferLocalAdapter,
    ]);
    expect(getPaymentProviderAdapters('development', true)).toEqual([
      StripePaymentProviderAdapter,
      QRLocalPaymentProviderAdapter,
      BankTransferLocalAdapter,
      MockPaymentProviderAdapter,
    ]);
    expect(getPaymentProviderAdapters('test', true)).toEqual([
      StripePaymentProviderAdapter,
      QRLocalPaymentProviderAdapter,
      BankTransferLocalAdapter,
      MockPaymentProviderAdapter,
    ]);
  });

  it('ignores the mock flag in production and logs a warning', () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(getPaymentProviderAdapters('production', true)).toEqual([
      StripePaymentProviderAdapter,
      QRLocalPaymentProviderAdapter,
      BankTransferLocalAdapter,
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
      QRLocalPaymentProviderAdapter,
      BankTransferLocalAdapter,
    ]);
    expect(warning).not.toHaveBeenCalled();

    warning.mockRestore();
  });

  it('does not resolve mock through the registry when the flag is off', () => {
    const registry = buildRegistry(false);

    expect(registry.supportedAdapterCodes()).toEqual([
      'bank_transfer_local',
      'qr_local',
      'stripe',
    ]);
    expect(registry.resolve('card').metadata.id).toBe('stripe');
    expect(registry.resolve('qr').metadata.id).toBe('qr_local');
  });

  it('resolves the mock through the registry when the flag is on', () => {
    const registry = buildRegistry(true);

    expect(registry.supportedAdapterCodes()).toEqual([
      'bank_transfer_local',
      'mock',
      'qr_local',
      'stripe',
    ]);
    expect(registry.resolve('card')).toBeInstanceOf(MockPaymentProviderAdapter);
    expect(registry.resolve('qr')).toBeInstanceOf(QRLocalPaymentProviderAdapter);
    expect(registry.resolve('bank_transfer')).toBeInstanceOf(BankTransferLocalAdapter);
  });
});
