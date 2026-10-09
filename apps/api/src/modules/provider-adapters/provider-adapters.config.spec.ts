import { MockPaymentProviderAdapter } from './adapters/mock/mock-payment-provider.adapter';
import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';
import { getPaymentProviderAdapters } from './provider-adapters.config';

describe('getPaymentProviderAdapters', () => {
  it('excludes the mock adapter in production', () => {
    expect(getPaymentProviderAdapters('production')).toEqual([StripePaymentProviderAdapter]);
  });

  it('includes the mock adapter outside production', () => {
    expect(getPaymentProviderAdapters('development')).toEqual([
      StripePaymentProviderAdapter,
      MockPaymentProviderAdapter,
    ]);
  });
});
