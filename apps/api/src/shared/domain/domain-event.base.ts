export abstract class DomainEvent<T = unknown> {
  public readonly eventId: string;
  public readonly occurredOn: Date;
  public abstract readonly eventName: string;
  public readonly aggregateId: string;
  public readonly payload: T;

  constructor(aggregateId: string, payload: T, eventId?: string, occurredOn?: Date) {
    this.eventId = eventId ?? crypto.randomUUID();
    this.occurredOn = occurredOn ?? new Date();
    this.aggregateId = aggregateId;
    this.payload = payload;
  }
}
