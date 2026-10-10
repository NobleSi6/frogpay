import { Logger } from '@nestjs/common';
import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';
import { MockPaymentProviderAdapter } from './adapters/mock/mock-payment-provider.adapter';

export const PAYMENT_PROVIDER_ADAPTERS_TOKEN = Symbol('PAYMENT_PROVIDER_ADAPTERS');

const logger = new Logger('PaymentProviderAdaptersConfig');

/** Register adapter classes here; their metadata supplies ids and capabilities. */
export function getPaymentProviderAdapters(
  nodeEnv = process.env.NODE_ENV || 'development',
  mockAdapterEnabled = process.env.PAYMENT_MOCK_ADAPTER_ENABLED === 'true',
) {
  if (nodeEnv === 'production') {
    if (mockAdapterEnabled) {
      logger.warn(
        'PAYMENT_MOCK_ADAPTER_ENABLED=true se ignora en producción; MockPaymentProviderAdapter no será registrado.',
      );
    }
    return [StripePaymentProviderAdapter] as const;
  }

  return mockAdapterEnabled
    ? [StripePaymentProviderAdapter, MockPaymentProviderAdapter] as const
    : [StripePaymentProviderAdapter] as const;
}

export const PAYMENT_PROVIDER_ADAPTERS = getPaymentProviderAdapters();
