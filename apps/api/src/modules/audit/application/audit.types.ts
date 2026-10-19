import type { Prisma } from '@prisma/client';

export interface AuditActor {
  type: 'user' | 'system' | 'api_key';
  id?: string;
  role?: string;
}

export interface AppendAuditRecord {
  eventId: string;
  tenantId: string;
  entity: string;
  entityId?: string;
  action: string;
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  actor: AuditActor;
  actorUserId?: string;
  requestId?: string;
  environment: 'sandbox' | 'production';
  occurredAt: Date;
  metadata?: Prisma.InputJsonValue;
}
