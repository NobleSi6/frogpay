import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { PrismaModule } from '../../shared/database/prisma.module';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { CredentialsEncryptionService } from '../provider-adapters/infrastructure/credentials/credentials-encryption.service';
import { PaymentEventsWebhookHandler } from './application/event-handlers/payment-events-webhook.handler';
import { WEBHOOK_SECRET_CIPHER } from './application/ports/webhook-secret-cipher.port';
import { DeliverWebhookUseCase } from './application/use-cases/deliver-webhook.use-case';
import { WebhookDeliveriesService } from './application/use-cases/webhook-deliveries.service';
import { WebhookEndpointsService } from './application/use-cases/webhook-endpoints.service';
import { WebhookDeliveryWorker } from './application/workers/webhook-delivery.worker';
import { WebhookHttpClient } from './infrastructure/http/webhook-http.client';
import { WebhookDispatchQueue } from './infrastructure/messaging/webhook-dispatch.queue';
import { WebhookDeliveryRepository } from './infrastructure/persistence/webhook-delivery.repository';
import { WebhookEndpointRepository } from './infrastructure/persistence/webhook-endpoint.repository';
import { WebhookDeliveriesController } from './presentation/http/webhook-deliveries.controller';
import { WebhookEndpointsController } from './presentation/http/webhook-endpoints.controller';

@Module({
  imports: [EventBusModule, PrismaModule, ProviderAdaptersModule],
  controllers: [WebhookEndpointsController, WebhookDeliveriesController],
  providers: [
    WebhookDeliveryRepository,
    WebhookEndpointRepository,
    WebhookHttpClient,
    WebhookDispatchQueue,
    DeliverWebhookUseCase,
    PaymentEventsWebhookHandler,
    WebhookDeliveryWorker,
    WebhookEndpointsService,
    WebhookDeliveriesService,
    {
      provide: WEBHOOK_SECRET_CIPHER,
      useExisting: CredentialsEncryptionService,
    },
  ],
  exports: [WebhookDeliveryRepository, WebhookDispatchQueue, WEBHOOK_SECRET_CIPHER],
})
export class WebhooksModule {}
