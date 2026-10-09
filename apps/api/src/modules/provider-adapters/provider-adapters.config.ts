import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';
import { MockPaymentProviderAdapter } from './adapters/mock/mock-payment-provider.adapter';

export const PAYMENT_PROVIDER_ADAPTERS_TOKEN = Symbol('PAYMENT_PROVIDER_ADAPTERS');

/** Register adapter classes here; their metadata supplies ids and capabilities. */
export function getPaymentProviderAdapters(nodeEnv = process.env.NODE_ENV || 'development') {
  return nodeEnv === 'production'
    ? [StripePaymentProviderAdapter] as const
    : [StripePaymentProviderAdapter, MockPaymentProviderAdapter] as const;
}

export const PAYMENT_PROVIDER_ADAPTERS = getPaymentProviderAdapters();
