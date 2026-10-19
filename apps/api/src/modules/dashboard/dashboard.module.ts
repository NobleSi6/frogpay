import { Module } from '@nestjs/common';
import { ProviderAdaptersModule } from '../provider-adapters/provider-adapters.module';
import { DashboardPaymentMethodsController } from './presentation/http/dashboard-payment-methods.controller';
import { CacheModule } from '../../shared/cache/cache.module';
import { DashboardMetricsController } from './presentation/http/dashboard-metrics.controller';
import { DashboardMetricsService } from './application/dashboard-metrics.service';

@Module({
  imports: [ProviderAdaptersModule, CacheModule],
  controllers: [DashboardPaymentMethodsController, DashboardMetricsController],
  providers: [DashboardMetricsService],
})
export class DashboardModule {}
