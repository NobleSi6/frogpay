import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DomainEvent } from '../../../../shared/domain/domain-event.base';
import { EVENT_BUS, EventHandler, IEventBus } from '../../../../shared/events/event-bus.interface';
import { buildEnvelope, WEBHOOK_SUBSCRIBABLE_EVENTS } from '../../domain/webhook-envelope';
import { WebhookDispatchQueue } from '../../infrastructure/messaging/webhook-dispatch.queue';
import { WebhookDeliveryRepository } from '../../infrastructure/persistence/webhook-delivery.repository';

type PaymentEventPayload = Record<string, unknown> & { paymentId?: string; environment?: string };

/**
 * Consumidor de eventos de pago (TSK-DEV2-301). Por cada endpoint suscrito del
 * tenant en el mismo ambiente crea una entrega (idempotente por eventId) y la
 * encola para el worker. No envía HTTP aquí: así un comercio lento no frena el bus.
 */
@Injectable()
export class PaymentEventsWebhookHandler implements OnModuleInit, EventHandler<PaymentEventPayload> {
  readonly queueName = 'frogpay.webhooks.payment-events';
  private readonly logger = new Logger(PaymentEventsWebhookHandler.name);

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly queue: WebhookDispatchQueue,
  ) {}

  onModuleInit(): void {
    for (const eventName of WEBHOOK_SUBSCRIBABLE_EVENTS) {
      this.eventBus.subscribe(eventName, this);
    }
  }

  async handle(event: DomainEvent<PaymentEventPayload>): Promise<void> {
    const tenantId = event.tenantId;
    if (!tenantId || !isUUID(tenantId)) {
      this.logger.warn(`Evento ${event.eventName} (${event.eventId}) sin tenantId; no se notifica.`);
      return;
    }
    const environment = event.payload?.environment === 'production' ? 'production' : 'sandbox';

    const webhookIds = await this.deliveries.findSubscribedWebhookIds(tenantId, event.eventName, environment);
    if (webhookIds.length === 0) return;

    const paymentId = typeof event.payload.paymentId === 'string' && isUUID(event.payload.paymentId)
      ? event.payload.paymentId
      : null;

    const pendingIds = await this.deliveries.createDeliveries({
      tenantId,
      webhookIds,
      eventId: event.eventId,
      eventType: event.eventName,
      paymentId,
      envelope: buildEnvelope({
        eventId: event.eventId,
        eventName: event.eventName,
        occurredOn: event.occurredOn,
        tenantId,
        payload: event.payload,
      }),
    });

    for (const deliveryId of pendingIds) {
      await this.queue.enqueue({ deliveryId, attempt: 1 });
    }
    this.logger.log(`Evento ${event.eventName} (${event.eventId}): ${pendingIds.length} entrega(s) encolada(s)`);
  }
}
