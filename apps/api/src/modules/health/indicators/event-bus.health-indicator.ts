import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, IEventBus } from '../../../shared/events/event-bus.interface';

export interface EventBusHealthStatus {
  status: 'up' | 'down';
  provider: 'in-memory' | 'rabbitmq';
}

@Injectable()
export class EventBusHealthIndicator {
  constructor(
    @Inject(EVENT_BUS)
    private readonly eventBus: IEventBus,
  ) {}

  check(): EventBusHealthStatus {
    const isRabbit = !!process.env.RABBITMQ_URL;
    return {
      status: this.eventBus ? 'up' : 'down',
      provider: isRabbit ? 'rabbitmq' : 'in-memory',
    };
  }
}
