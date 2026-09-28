import { DomainEvent } from '../domain/domain-event.base';

export interface EventHandler<T = unknown> {
  handle(event: DomainEvent<T>): Promise<void> | void;
}

export const EVENT_BUS_TOKEN = Symbol('IEventBus');
export const EVENT_BUS = EVENT_BUS_TOKEN;

export interface IEventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe<T>(eventName: string, handler: EventHandler<T>): void;
}
