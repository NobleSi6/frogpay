import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { PaymentEventProbe } from './infrastructure/events/payment-event-probe';
import { IdempotencyService } from './infrastructure/idempotency/idempotency.service';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from './application/use-cases/get-payment.use-case';
import { PaymentSettlementService } from './application/use-cases/payment-settlement.service';
import { PaymentQrExpirationJob } from './application/use-cases/payment-qr-expiration.job';
import { ApiKeyAuthGuard } from './presentation/guards/api-key-auth.guard';
import { PaymentsController } from './presentation/http/payments.controller';
import { DashboardPaymentsController } from './presentation/http/dashboard-payments.controller';
import { PROVIDER_RETRY_SCHEDULER } from './application/ports/provider-retry-scheduler.port';
import { RetryProviderAuthorizationUseCase } from './application/use-cases/retry-provider-authorization.use-case';
import { ProviderRetryWorker } from './application/workers/provider-retry.worker';
import { ProviderRetryQueue } from './infrastructure/messaging/provider-retry.queue';

@Module({
  imports: [EventBusModule, ProviderAdaptersModule, CacheModule],
  controllers: [PaymentsController, DashboardPaymentsController],
  providers: [
    PaymentEventProbe,
    IdempotencyService,
    CreatePaymentUseCase,
    GetPaymentUseCase,
    PaymentSettlementService,
    PaymentQrExpirationJob,
    ApiKeyAuthGuard,
    // TSK-DEV2-305: reintentos de pagos asíncronos con backoff y DLQ de pagos
    ProviderRetryQueue,
    { provide: PROVIDER_RETRY_SCHEDULER, useExisting: ProviderRetryQueue },
    RetryProviderAuthorizationUseCase,
    ProviderRetryWorker,
  ],
  exports: [
    PaymentEventProbe,
    IdempotencyService,
    CreatePaymentUseCase,
    GetPaymentUseCase,
    PaymentSettlementService,
  ],
})
export class PaymentsModule {}
