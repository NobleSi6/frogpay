import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ApiKeyAuthGuard } from '../payments/presentation/guards/api-key-auth.guard';
import { PaymentSimulationService } from './application/payment-simulation.service';

@Module({
  imports: [PaymentsModule],
  providers: [ApiKeyAuthGuard, PaymentSimulationService],
  exports: [PaymentSimulationService],
})
export class SimulatorsModule {}
