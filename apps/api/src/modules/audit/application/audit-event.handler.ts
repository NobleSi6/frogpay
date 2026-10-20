import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '../../../shared/domain/domain-event.base';
import { EventCatalog } from '../../../shared/events/event-catalog';
import {
  EVENT_BUS,
  EventHandler,
  IEventBus,
} from '../../../shared/events/event-bus.interface';
import { AuditService, systemActor } from './audit.service';

type PaymentAuditPayload = {
  paymentId?: string;
  environment?: 'sandbox' | 'production';
  requestId?: string;
};

@Injectable()
export class AuditEventHandler
  implements OnModuleInit, EventHandler<PaymentAuditPayload>
{
  readonly queueName = 'frogpay.audit.payments';

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe(EventCatalog.PAGO_CREADO, this);
    this.eventBus.subscribe(EventCatalog.PAGO_APROBADO, this);
    this.eventBus.subscribe(EventCatalog.PAGO_RECHAZADO, this);
    this.eventBus.subscribe(EventCatalog.PAGO_REEMBOLSADO, this);
  }

  async handle(event: DomainEvent<PaymentAuditPayload>): Promise<void> {
    if (!event.tenantId)
      throw new Error('El evento de pago no incluye tenantId');
    const action = event.eventName;
    const nextStatus =
      action === EventCatalog.PAGO_CREADO
        ? 'pending'
        : action === EventCatalog.PAGO_APROBADO
          ? 'approved'
          : action === EventCatalog.PAGO_RECHAZADO
            ? 'rejected'
            : 'refunded';
    await this.audit.append({
      eventId: event.eventId,
      tenantId: event.tenantId,
      entity: 'payment',
      entityId: event.payload.paymentId ?? event.aggregateId,
      action,
      previousState:
        action === EventCatalog.PAGO_CREADO
          ? undefined
          : {
              status:
                action === EventCatalog.PAGO_REEMBOLSADO
                  ? 'approved'
                  : 'pending',
            },
      newState: { status: nextStatus },
      actor: systemActor('payment-events'),
      requestId: event.payload.requestId,
      environment: event.payload.environment ?? 'production',
      occurredAt: new Date(event.occurredOn),
    });
  }
}
