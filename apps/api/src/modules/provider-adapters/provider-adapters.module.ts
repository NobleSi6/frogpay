import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { AdapterEventProbe } from './infrastructure/events/adapter-event-probe';
import { StripeCredentialsController } from './presentation/http/stripe-credentials.controller';
import { StripeCredentialsService } from './application/stripe-credentials.service';
import { CredentialsEncryptionService } from './infrastructure/credentials/credentials-encryption.service';
import { BankTransferLocalAdapter } from './adapters/bank-transfer/bank-transfer.adapter';
import type { PaymentProviderPort } from './ports/payment-provider.port';
import { stripeClientProvider } from './adapters/stripe/stripe-client.provider';
import {
  resolveStripeProviderConfig,
  STRIPE_PROVIDER_CONFIG,
} from './adapters/stripe/stripe-provider.config';
import { PAYMENT_PROVIDER_PORT } from './ports/payment-provider.port';
import {
  DEFAULT_PAYMENT_PROVIDER_BINDINGS,
  parsePaymentProviderBindings,
  PaymentProviderRegistration,
} from './registry/payment-provider.binding';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';
import {
  PAYMENT_PROVIDER_ADAPTERS,
  PAYMENT_PROVIDER_ADAPTERS_TOKEN,
} from './provider-adapters.config';
import { CircuitBreakerModule } from './resilience/circuit-breaker.module';
import { CircuitBreakerRegistry } from './resilience/circuit-breaker.registry';

/**
 * Proveedores disponibles y credenciales de Stripe administradas por tenant.
 * Payments selecciona el adaptador usando PaymentProviderRegistry.
 */
@Module({
  imports: [EventBusModule, CircuitBreakerModule],
  controllers: [StripeCredentialsController],
  providers: [
    AdapterEventProbe,
    StripeCredentialsService,
    CredentialsEncryptionService,
    ...PAYMENT_PROVIDER_ADAPTERS,
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
    {
      provide: PAYMENT_PROVIDER_PORT,
      useExisting: PAYMENT_PROVIDER_ADAPTERS[0],
    },
    {
      provide: PAYMENT_PROVIDER_ADAPTERS_TOKEN,
      inject: [...PAYMENT_PROVIDER_ADAPTERS],
      useFactory: (...adapters: PaymentProviderPort[]): PaymentProviderRegistration[] =>
        adapters.map((adapter) => ({
          adapterCode: adapter.metadata.id,
          adapter,
        })),
    },
    {
      provide: PaymentProviderRegistry,
      inject: [ConfigService, PAYMENT_PROVIDER_ADAPTERS_TOKEN, CircuitBreakerRegistry],
      useFactory: (
        config: ConfigService,
        registrations: PaymentProviderRegistration[],
        breakers: CircuitBreakerRegistry,
      ): PaymentProviderRegistry => {
        // Cada adaptador se registra envuelto en su propio circuito (TSK-DEV2-304).
        const registry = new PaymentProviderRegistry(
          registrations.map((registration) => ({
            adapterCode: registration.adapterCode,
            adapter: breakers.protect(registration.adapterCode, registration.adapter),
          })),
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
    BankTransferLocalAdapter,
    CircuitBreakerModule,
  ],
})
export class ProviderAdaptersModule {}
