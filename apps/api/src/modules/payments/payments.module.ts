import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { PaymentEventProbe } from './infrastructure/events/payment-event-probe';
import { IdempotencyService } from './infrastructure/idempotency/idempotency.service';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from './application/use-cases/get-payment.use-case';
import { ApiKeyAuthGuard } from './presentation/guards/api-key-auth.guard';
import { PaymentsController } from './presentation/http/payments.controller';
import { DashboardPaymentsController } from './presentation/http/dashboard-payments.controller';

@Module({
  imports: [EventBusModule, ProviderAdaptersModule, CacheModule],
  controllers: [PaymentsController, DashboardPaymentsController],
  providers: [
    PaymentEventProbe,
    IdempotencyService,
    CreatePaymentUseCase,
    GetPaymentUseCase,
    ApiKeyAuthGuard,
  ],
  exports: [
    PaymentEventProbe,
    IdempotencyService,
    CreatePaymentUseCase,
    GetPaymentUseCase,
  ],
})
export class PaymentsModule {}
