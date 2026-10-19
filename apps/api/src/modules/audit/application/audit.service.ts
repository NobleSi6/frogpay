import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaTenantContextService,
  TenantTx,
} from '../../../shared/database/prisma-tenant-context.service';
import { AuditVerificationUnavailableError } from '../../../shared/http/errors/audit-verification-unavailable-error';
import type { AppendAuditRecord, AuditActor } from './audit.types';

const SENSITIVE_KEY =
  /(secret|password|credential|token|authorization|api.?key|pan|cvc|cipher)/i;

export interface AuditListFilters {
  page: number;
  limit: number;
  paymentId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaTenantContextService) {}

  append(
    input: AppendAuditRecord,
  ): Promise<{ id: string; duplicate: boolean }> {
    return this.db.withTenant(input.tenantId, (tx) =>
      this.appendInTransaction(tx, input),
    );
  }

  async appendInTransaction(
    tx: TenantTx,
    input: AppendAuditRecord,
  ): Promise<{ id: string; duplicate: boolean }> {
    const duplicate = await tx.audit_log.findUnique({
      where: { event_id: input.eventId },
      select: { id: true },
    });
    if (duplicate) return { id: duplicate.id, duplicate: true };

    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId}, 0))`;

    const duplicateAfterLock = await tx.audit_log.findUnique({
      where: { event_id: input.eventId },
      select: { id: true },
    });
    if (duplicateAfterLock)
      return { id: duplicateAfterLock.id, duplicate: true };

    const previous = await tx.audit_log.findFirst({
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      select: { record_hash: true },
    });
    const previousHash = previous?.record_hash.trim() ?? null;
    const actor = sanitizeJson(input.actor) as Prisma.InputJsonObject;
    const previousState =
      input.previousState === undefined
        ? null
        : sanitizeJson(input.previousState);
    const newState =
      input.newState === undefined ? null : sanitizeJson(input.newState);
    const metadata = sanitizeJson(
      input.metadata ?? {},
    ) as Prisma.InputJsonObject;

    const hash = await tx.$queryRaw<Array<{ value: string }>>`
      SELECT audit_compute_hash(
        CAST(${input.eventId} AS uuid),
        CAST(${input.tenantId} AS uuid),
        ${input.entity},
        CAST(${input.entityId ?? null} AS uuid),
        ${input.action},
        CAST(${previousState === null ? null : JSON.stringify(previousState)} AS jsonb),
        CAST(${newState === null ? null : JSON.stringify(newState)} AS jsonb),
        CAST(${JSON.stringify(actor)} AS jsonb),
        ${input.requestId ?? null},
        ${input.environment},
        ${input.occurredAt},
        ${previousHash}
      ) AS value
    `;

    const created = await tx.audit_log.create({
      data: {
        event_id: input.eventId,
        tenant_id: input.tenantId,
        actor_user_id: input.actorUserId,
        entity: input.entity,
        entity_id: input.entityId,
        action: input.action,
        previous_state: previousState === null ? Prisma.DbNull : previousState,
        new_state: newState === null ? Prisma.DbNull : newState,
        actor,
        request_id: input.requestId,
        environment: input.environment,
        metadata,
        occurred_at: input.occurredAt,
        previous_hash: previousHash,
        record_hash: hash[0].value,
      },
      select: { id: true },
    });
    return { id: created.id, duplicate: false };
  }

  list(tenantId: string, filters: AuditListFilters) {
    return this.db.withTenant(tenantId, async (tx) => {
      const where: Prisma.audit_logWhereInput = {
        ...(filters.paymentId
          ? { entity: 'payment', entity_id: filters.paymentId }
          : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.from || filters.to
          ? {
              occurred_at: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lt: filters.to } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.audit_log.findMany({
          where,
          orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
          select: {
            event_id: true,
            entity: true,
            entity_id: true,
            action: true,
            previous_state: true,
            new_state: true,
            actor: true,
            request_id: true,
            environment: true,
            occurred_at: true,
          },
        }),
        tx.audit_log.count({ where }),
      ]);
      return {
        data: rows.map((row) => ({
          eventId: row.event_id,
          entity: row.entity,
          entityId: row.entity_id,
          action: row.action,
          previousState: row.previous_state,
          newState: row.new_state,
          actor: row.actor,
          requestId: row.request_id,
          environment: row.environment,
          createdAt: row.occurred_at.toISOString(),
        })),
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      };
    });
  }

  verify(tenantId: string) {
    return this.db
      .withGlobalAccess(async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true },
        });
        if (!tenant) throw new NotFoundException('Tenant no encontrado');
        const rows = await tx.audit_log.findMany({
          where: { tenant_id: tenantId },
          orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
        });
        let previousHash: string | null = null;
        for (const row of rows) {
          const expected = await tx.$queryRaw<Array<{ value: string }>>`
          SELECT audit_compute_hash(
            ${row.event_id}, ${row.tenant_id}, ${row.entity}, ${row.entity_id},
            ${row.action}, CAST(${jsonParam(row.previous_state)} AS jsonb),
            CAST(${jsonParam(row.new_state)} AS jsonb), CAST(${jsonParam(row.actor)} AS jsonb),
            ${row.request_id}, ${row.environment}, ${row.occurred_at}, ${previousHash}
          ) AS value
        `;
          if (
            row.previous_hash?.trim() !== previousHash ||
            row.record_hash.trim() !== expected[0].value
          ) {
            return verificationResult(
              tenantId,
              rows.length,
              row.event_id,
              row.occurred_at,
            );
          }
          previousHash = row.record_hash.trim();
        }
        return verificationResult(tenantId, rows.length, null, null);
      })
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) throw error;
        throw new AuditVerificationUnavailableError();
      });
  }

  async verifyAllTenants(): Promise<
    Array<{ tenantId: string; valid: boolean }>
  > {
    const tenants = await this.db.withGlobalAccess((tx) =>
      tx.tenant.findMany({ select: { id: true } }),
    );
    const results = [];
    for (const tenant of tenants) {
      const result = await this.verify(tenant.id);
      results.push({ tenantId: tenant.id, valid: result.valid });
    }
    return results;
  }
}

function verificationResult(
  tenantId: string,
  recordsChecked: number,
  firstBrokenEventId: string | null,
  firstBrokenAt: Date | null,
) {
  return {
    tenantId,
    valid: firstBrokenEventId === null,
    recordsChecked,
    firstBrokenEventId,
    firstBrokenAt: firstBrokenAt?.toISOString() ?? null,
    verifiedAt: new Date().toISOString(),
  };
}

function jsonParam(value: Prisma.JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

export function sanitizeJson(value: unknown): Prisma.InputJsonValue | null {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeJson(item),
      ]),
    );
  }
  return String(value);
}

export function systemActor(id = 'frogpay-api'): AuditActor {
  return { type: 'system', id };
}
