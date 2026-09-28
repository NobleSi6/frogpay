import { DomainEvent } from '../domain/domain-event.base';
import { EventCatalog } from './event-catalog';

export interface ArchitectureSmokePayload {
  source: string;
  message: string;
}

export class ArchitectureSmokeEvent extends DomainEvent<ArchitectureSmokePayload> {
  readonly eventName = EventCatalog.ARQUITECTURA_PRUEBA;

  constructor(payload: ArchitectureSmokePayload) {
    super('frogpay-architecture', payload);
  }
}
