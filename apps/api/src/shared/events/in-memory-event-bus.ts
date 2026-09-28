import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { DomainEvent } from '../domain/domain-event.base';
import { EventHandler, IEventBus } from './event-bus.interface';

@Injectable()
export class InMemoryEventBus implements IEventBus {
  readonly provider = 'in-memory' as const;
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(InMemoryEventBus.name);

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.logger.log(`[EventBus] Publicando evento: ${event.eventName} (ID: ${event.eventId}, Aggregate: ${event.aggregateId})`);
    this.emitter.emit(event.eventName, event);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    this.logger.log(`[EventBus] Suscribiendo handler a evento: ${eventName}`);
    this.emitter.on(eventName, async (event: DomainEvent<T>) => {
      try {
        await handler.handle(event);
      } catch (error) {
        this.logger.error(`[EventBus] Error procesando evento ${eventName}: ${(error as Error).message}`, (error as Error).stack);
      }
    });
  }
}
