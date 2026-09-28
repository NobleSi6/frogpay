import { Module } from '@nestjs/common';
import { HealthController } from './presentation/http/health.controller';
import { ApiHealthIndicator } from './indicators/api.health-indicator';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { EventBusHealthIndicator } from './indicators/event-bus.health-indicator';
import { EventBusModule } from '../../shared/events/event-bus.module';

@Module({
  controllers: [HealthController],
  imports: [EventBusModule],
  providers: [
    ApiHealthIndicator,
    DatabaseHealthIndicator,
    EventBusHealthIndicator,
  ],
})
export class HealthModule {}
