/** Sobre versionado que recibe el comercio (docs/api/webhooks.md). */
export const WEBHOOK_PAYLOAD_VERSION = 1;

/** Eventos que se notifican a los comercios en el Sprint 3. */
export const WEBHOOK_SUBSCRIBABLE_EVENTS = ['pago.creado', 'pago.aprobado', 'pago.rechazado'] as const;
export type WebhookEventName = (typeof WEBHOOK_SUBSCRIBABLE_EVENTS)[number];
export const WEBHOOK_TEST_EVENT = 'webhook.prueba';

export interface WebhookEnvelope {
  version: number;
  eventId: string;
  eventName: string;
  occurredOn: string;
  tenantId: string;
  payload: Record<string, unknown>;
}

export function buildEnvelope(input: {
  eventId: string;
  eventName: string;
  occurredOn: Date | string;
  tenantId: string;
  payload: Record<string, unknown>;
}): WebhookEnvelope {
  const occurredOn =
    input.occurredOn instanceof Date ? input.occurredOn.toISOString() : new Date(input.occurredOn).toISOString();
  return {
    version: WEBHOOK_PAYLOAD_VERSION,
    eventId: input.eventId,
    eventName: input.eventName,
    occurredOn,
    tenantId: input.tenantId,
    payload: input.payload,
  };
}
