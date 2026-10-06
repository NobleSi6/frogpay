import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EVENT_BUS } from './event-bus.interface';
import { RabbitMqEventBus } from './rabbitmq-event-bus';
import { OutboxEventPublisher } from './outbox-event-publisher.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RabbitMqEventBus,
    OutboxEventPublisher,
    { provide: EVENT_BUS, useExisting: RabbitMqEventBus },
  ],
  exports: [EVENT_BUS, RabbitMqEventBus, OutboxEventPublisher],
})
export class EventBusModule {}
