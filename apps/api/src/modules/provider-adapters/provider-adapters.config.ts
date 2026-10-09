import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';

export const PAYMENT_PROVIDER_ADAPTERS_TOKEN = Symbol('PAYMENT_PROVIDER_ADAPTERS');

/** Register adapter classes here; their metadata supplies ids and capabilities. */
export const PAYMENT_PROVIDER_ADAPTERS = [StripePaymentProviderAdapter] as const;
