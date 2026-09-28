import { DomainEvent } from '../../../../shared/domain/domain-event.base';
import { EventCatalog } from '../../../../shared/events/event-catalog';

export interface TenantCreatedEventPayload {
  tenantId: string;
  name: string;
  taxId: string;
  contactEmail: string;
  plan: string;
  status: string;
  owner: {
    userId: string;
    email: string;
    role: string;
    status: string;
    invitationExpiresAt: Date;
  };
  apiKeys: Array<{
    apiKeyId: string;
    type: 'test' | 'live';
    keyPrefix: string;
    maskedKey: string;
  }>;
}

export class TenantCreatedEvent extends DomainEvent<TenantCreatedEventPayload> {
  public readonly eventName = EventCatalog.TENANT_CREADO;

  constructor(payload: TenantCreatedEventPayload) {
    super(payload.tenantId, payload);
  }
}
