import { Module } from '@nestjs/common';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { DashboardPaymentMethodsController } from './presentation/http/dashboard-payment-methods.controller';

@Module({
  imports: [ProviderAdaptersModule],
  controllers: [DashboardPaymentMethodsController],
})
export class DashboardModule {}
