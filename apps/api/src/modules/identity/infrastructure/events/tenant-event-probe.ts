import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, EventHandler, IEventBus } from '../../../../shared/events/event-bus.interface';
import { EventCatalog } from '../../../../shared/events/event-catalog';
import { ArchitectureSmokePayload } from '../../../../shared/events/architecture-smoke.event';
import { DomainEvent } from '../../../../shared/domain/domain-event.base';

@Injectable()
export class TenantEventProbe implements OnModuleInit, EventHandler<ArchitectureSmokePayload> {
  readonly queueName = 'frogpay.tenants.smoke';
  private readonly logger = new Logger(TenantEventProbe.name);

  constructor(@Inject(EVENT_BUS) private readonly eventBus: IEventBus) {}

  onModuleInit(): void {
    this.eventBus.subscribe(EventCatalog.ARQUITECTURA_PRUEBA, this);
  }

  handle(event: DomainEvent<ArchitectureSmokePayload>): void {
    this.logger.log(`Tenant module recibió ${event.eventName} (${event.eventId})`);
  }
}
