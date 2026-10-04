import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { AdapterEventProbe } from './infrastructure/events/adapter-event-probe';
import { StripeCredentialsController } from './presentation/http/stripe-credentials.controller';
import { StripeCredentialsService } from './application/stripe-credentials.service';
import { CredentialsEncryptionService } from './infrastructure/credentials/credentials-encryption.service';

@Module({
  imports: [EventBusModule],
  controllers: [StripeCredentialsController],
  providers: [
    AdapterEventProbe,
    StripeCredentialsService,
    CredentialsEncryptionService,
  ],
  exports: [AdapterEventProbe, StripeCredentialsService],
})
export class ProviderAdaptersModule {}
