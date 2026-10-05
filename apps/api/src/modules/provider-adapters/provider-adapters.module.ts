import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { AdapterEventProbe } from './infrastructure/events/adapter-event-probe';
import { StripeCredentialsController } from './presentation/http/stripe-credentials.controller';
import { StripeCredentialsService } from './application/stripe-credentials.service';
import { CredentialsEncryptionService } from './infrastructure/credentials/credentials-encryption.service';
import { PAYMENT_PROVIDER_PORT } from './ports/payment-provider.port';
import { StripeAdapter } from './adapters/stripe/stripe.adapter';

@Module({
  imports: [EventBusModule],
  controllers: [StripeCredentialsController],
  providers: [
    AdapterEventProbe,
    StripeCredentialsService,
    CredentialsEncryptionService,
    StripeAdapter,
    {
      provide: PAYMENT_PROVIDER_PORT,
      useClass: StripeAdapter,
    },
  ],
  exports: [
    AdapterEventProbe,
    StripeCredentialsService,
    CredentialsEncryptionService,
    PAYMENT_PROVIDER_PORT,
    StripeAdapter,
  ],
})
export class ProviderAdaptersModule {}
