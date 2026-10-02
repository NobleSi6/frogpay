import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from './event-bus.interface';
import { RabbitMqEventBus } from './rabbitmq-event-bus';
import { OutboxEventPublisher } from './outbox-event-publisher.service';

@Global()
@Module({
  providers: [
    RabbitMqEventBus,
    OutboxEventPublisher,
    { provide: EVENT_BUS, useExisting: RabbitMqEventBus },
  ],
  exports: [EVENT_BUS, RabbitMqEventBus, OutboxEventPublisher],
})
export class EventBusModule {}
