import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENT_BUS, IEventBus } from './event-bus.interface';
import { Inject } from '@nestjs/common';
import { ArchitectureSmokeEvent } from './architecture-smoke.event';

@Injectable()
export class EventBusSmokePublisher implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventBusSmokePublisher.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('nodeEnv') !== 'development') return;
    await this.eventBus.publish(new ArchitectureSmokeEvent({
      source: 'api',
      message: 'RabbitMQ event bus smoke test',
    }));
    this.logger.log('Evento de prueba listo en la cola frogpay.events.smoke');
  }
}
