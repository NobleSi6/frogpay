import { Module } from '@nestjs/common';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { PaymentEventProbe } from './infrastructure/events/payment-event-probe';

@Module({
  imports: [EventBusModule],
  providers: [PaymentEventProbe],
  exports: [PaymentEventProbe],
})
export class PaymentsModule {}
