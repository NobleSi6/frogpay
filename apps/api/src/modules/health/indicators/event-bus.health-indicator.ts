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

  async check(): Promise<EventBusHealthStatus> {
    const healthy = await this.eventBus.checkHealth?.() ?? false;
    return {
      status: healthy ? 'up' : 'down',
      provider: this.eventBus.provider ?? 'in-memory',
    };
  }
}
