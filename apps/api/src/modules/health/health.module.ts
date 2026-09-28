import { Module } from '@nestjs/common';
import { HealthController } from './presentation/http/health.controller';
import { ApiHealthIndicator } from './indicators/api.health-indicator';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { EventBusHealthIndicator } from './indicators/event-bus.health-indicator';
import { EVENT_BUS } from '../../shared/events/event-bus.interface';
import { InMemoryEventBus } from '../../shared/events/in-memory-event-bus';

@Module({
  controllers: [HealthController],
  providers: [
    ApiHealthIndicator,
    DatabaseHealthIndicator,
    EventBusHealthIndicator,
    {
      provide: EVENT_BUS,
      useClass: InMemoryEventBus,
    },
  ],
})
export class HealthModule {}
