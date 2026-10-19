import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/database/prisma.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { CircuitBreakerModule } from '../provider-adapters/resilience/circuit-breaker.module';

import { ApiHealthIndicator } from '../health/indicators/api.health-indicator';
import { DatabaseHealthIndicator } from '../health/indicators/database.health-indicator';
import { EventBusHealthIndicator } from '../health/indicators/event-bus.health-indicator';

import { PlatformStatusController } from './platform-status.controller';
import { PlatformStatusService } from './platform-status.service';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    EventBusModule,
    CircuitBreakerModule,
  ],
  controllers: [PlatformStatusController],
  providers: [
    PlatformStatusService,
    ApiHealthIndicator,
    DatabaseHealthIndicator,
    EventBusHealthIndicator,
  ],
})
export class PlatformStatusModule {}
