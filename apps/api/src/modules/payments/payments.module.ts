import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { PaymentEventProbe } from './infrastructure/events/payment-event-probe';
import { IdempotencyService } from './infrastructure/idempotency/idempotency.service';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from './application/use-cases/get-payment.use-case';
import { BankReconciliationService } from './application/services/bank-reconciliation.service';
import { BankTransferExpirationService } from './application/services/bank-transfer-expiration.service';
import { ApiKeyAuthGuard } from './presentation/guards/api-key-auth.guard';
import { PaymentsController } from './presentation/http/payments.controller';
import { DashboardPaymentsController } from './presentation/http/dashboard-payments.controller';
import { SimulatorsController } from './presentation/http/simulators.controller';
import { DashboardBankTransactionsController } from './presentation/http/dashboard-bank-transactions.controller';

@Module({
  imports: [EventBusModule, ProviderAdaptersModule, CacheModule],
  controllers: [
    PaymentsController,
    DashboardPaymentsController,
    SimulatorsController,
    DashboardBankTransactionsController,
  ],
  providers: [
    PaymentEventProbe,
    IdempotencyService,
    CreatePaymentUseCase,
    GetPaymentUseCase,
    BankReconciliationService,
    BankTransferExpirationService,
    ApiKeyAuthGuard,
  ],
  exports: [
    PaymentEventProbe,
    IdempotencyService,
    CreatePaymentUseCase,
    GetPaymentUseCase,
    BankReconciliationService,
    BankTransferExpirationService,
  ],
})
export class PaymentsModule {}
