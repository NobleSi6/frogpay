import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { AdapterEventProbe } from './infrastructure/events/adapter-event-probe';
import { StripeCredentialsController } from './presentation/http/stripe-credentials.controller';
import { StripeCredentialsService } from './application/stripe-credentials.service';
import { CredentialsEncryptionService } from './infrastructure/credentials/credentials-encryption.service';
import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';
import {
  STRIPE_ADAPTER_CODE,
  stripeClientProvider,
} from './adapters/stripe/stripe-client.provider';
import {
  resolveStripeProviderConfig,
  STRIPE_PROVIDER_CONFIG,
} from './adapters/stripe/stripe-provider.config';
import { PAYMENT_PROVIDER_PORT } from './ports/payment-provider.port';
import {
  DEFAULT_PAYMENT_PROVIDER_BINDINGS,
  parsePaymentProviderBindings,
} from './registry/payment-provider.binding';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';

/**
 * Proveedores disponibles y credenciales de Stripe administradas por tenant.
 * Payments selecciona el adaptador usando PaymentProviderRegistry.
 */
@Module({
  imports: [EventBusModule],
  controllers: [StripeCredentialsController],
  providers: [
    AdapterEventProbe,
    StripeCredentialsService,
    CredentialsEncryptionService,
    {
      provide: STRIPE_PROVIDER_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveStripeProviderConfig({
          STRIPE_SECRET_KEY: config.get<string>('STRIPE_SECRET_KEY'),
          STRIPE_TIMEOUT_MS: config.get<string>('STRIPE_TIMEOUT_MS'),
          STRIPE_MAX_NETWORK_RETRIES: config.get<string>('STRIPE_MAX_NETWORK_RETRIES'),
          STRIPE_API_HOST: config.get<string>('STRIPE_API_HOST'),
          STRIPE_API_PORT: config.get<string>('STRIPE_API_PORT'),
          STRIPE_API_PROTOCOL: config.get<string>('STRIPE_API_PROTOCOL'),
        }),
    },
    stripeClientProvider,
    StripePaymentProviderAdapter,
    {
      provide: PAYMENT_PROVIDER_PORT,
      useExisting: StripePaymentProviderAdapter,
    },
    {
      provide: PaymentProviderRegistry,
      inject: [ConfigService, StripePaymentProviderAdapter],
      useFactory: (
        config: ConfigService,
        stripeAdapter: StripePaymentProviderAdapter,
      ): PaymentProviderRegistry => {
        const registry = new PaymentProviderRegistry(
          [{ adapterCode: STRIPE_ADAPTER_CODE, adapter: stripeAdapter }],
          DEFAULT_PAYMENT_PROVIDER_BINDINGS,
        );
        const override = config.get<string>('PAYMENT_PROVIDER_BINDINGS')?.trim();
        if (override) {
          registry.applyBindings(parsePaymentProviderBindings(override), true);
        }
        return registry;
      },
    },
  ],
  exports: [
    AdapterEventProbe,
    StripeCredentialsService,
    CredentialsEncryptionService,
    PAYMENT_PROVIDER_PORT,
    PaymentProviderRegistry,
  ],
})
export class ProviderAdaptersModule {}
