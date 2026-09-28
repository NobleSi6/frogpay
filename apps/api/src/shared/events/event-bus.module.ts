import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from './event-bus.interface';
import { RabbitMqEventBus } from './rabbitmq-event-bus';

@Global()
@Module({
  providers: [RabbitMqEventBus, { provide: EVENT_BUS, useExisting: RabbitMqEventBus }],
  exports: [EVENT_BUS, RabbitMqEventBus],
})
export class EventBusModule {}
