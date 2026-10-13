import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { CircuitBreakerModule } from '../provider-adapters/resilience/circuit-breaker.module';
import { ProviderFaultController } from './presentation/http/provider-fault.controller';
import { ApiKeyAuthGuard } from '../payments/presentation/guards/api-key-auth.guard';
import { PaymentSimulationService } from './application/payment-simulation.service';
import { DashboardPaymentSimulationController } from './presentation/http/dashboard-payment-simulation.controller';
import { QrCallbackController } from './presentation/http/qr-callback.controller';
import { PaymentQrAutoConfirmJob } from './application/payment-qr-auto-confirm.job';

@Module({
  imports: [PaymentsModule, ProviderAdaptersModule, CircuitBreakerModule],
  controllers: [DashboardPaymentSimulationController, QrCallbackController, ProviderFaultController],
  providers: [ApiKeyAuthGuard, PaymentSimulationService, PaymentQrAutoConfirmJob],
  exports: [PaymentSimulationService],
})
export class SimulatorsModule {}
