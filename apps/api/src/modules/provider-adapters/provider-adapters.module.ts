import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { AdapterEventProbe } from './infrastructure/events/adapter-event-probe';

@Module({
  imports: [EventBusModule],
  providers: [AdapterEventProbe],
  exports: [AdapterEventProbe],
})
export class ProviderAdaptersModule {}
