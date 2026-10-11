import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ApiKeyAuthGuard } from '../payments/presentation/guards/api-key-auth.guard';
import { PaymentSimulationService } from './application/payment-simulation.service';
import { DashboardPaymentSimulationController } from './presentation/http/dashboard-payment-simulation.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [DashboardPaymentSimulationController],
  providers: [ApiKeyAuthGuard, PaymentSimulationService],
  exports: [PaymentSimulationService],
})
export class SimulatorsModule {}
