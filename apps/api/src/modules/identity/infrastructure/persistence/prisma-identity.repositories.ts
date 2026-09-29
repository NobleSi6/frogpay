import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService, TenantTx } from '../../../../shared/database/prisma-tenant-context.service';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { Tenant } from '../../domain/entities/tenant.entity';
import { User } from '../../domain/entities/user.entity';
import { IApiKeyRepository } from '../../domain/repositories/api-key.repository.interface';
import { ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';

@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly context: PrismaTenantContextService) {}

  findById(id: string): Promise<Tenant | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.tenant.findUnique({ where: { id } });
      return row ? tenantFromRow(row) : null;
    });
  }

  findByTaxId(taxId: string): Promise<Tenant | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.tenant.findUnique({ where: { taxId: taxId.trim().toUpperCase() } });
      return row ? tenantFromRow(row) : null;
    });
  }

  findByName(name: string): Promise<Tenant | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.tenant.findFirst({ where: { name: { equals: name.trim(), mode: 'insensitive' } } });
      return row ? tenantFromRow(row) : null;
    });
  }

  save(tenant: Tenant): Promise<void> {
    return this.context.withGlobalAccess(async (tx) => {
      const data = {
        name: tenant.name,
        taxId: tenant.taxId.value,
        contactEmail: tenant.contactEmail.value,
        status: tenant.status,
        plan: tenant.plan,
        webhookUrl: tenant.webhookUrl ?? null,
        metadata: (tenant.metadata ?? {}) as Prisma.InputJsonValue,
        updatedAt: tenant.updatedAt,
      };
      await tx.tenant.upsert({ where: { id: tenant.id }, create: { id: tenant.id, ...data }, update: data });
    });
  }
}

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly context: PrismaTenantContextService) {}

  findById(id: string): Promise<User | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.user.findUnique({ where: { id } });
      return row ? userFromRow(row) : null;
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      return row ? userFromRow(row) : null;
    });
  }

  findByInvitationTokenHash(tokenHash: string): Promise<User | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.user.findUnique({ where: { invitationTokenHash: tokenHash } });
      return row ? userFromRow(row) : null;
    });
  }

  save(user: User): Promise<void> {
    return this.context.withGlobalAccess(async (tx) => {
      const data = {
        tenantId: user.tenantId,
        email: user.email.value,
        name: user.name ?? null,
        role: user.role,
        status: user.status,
        invitationTokenHash: user.invitationTokenHash ?? null,
        invitationExpiresAt: user.invitationExpiresAt ?? null,
        passwordHash: user.passwordHash ?? null,
        updatedAt: user.updatedAt,
      };
      await tx.user.upsert({ where: { id: user.id }, create: { id: user.id, ...data }, update: data });
    });
  }
}

@Injectable()
export class PrismaApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly context: PrismaTenantContextService) {}

  findById(id: string): Promise<ApiKey | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.apiKey.findUnique({ where: { id } });
      return row ? apiKeyFromRow(row) : null;
    });
  }

  findByTenantId(tenantId: string): Promise<ApiKey[]> {
    return this.context.withTenant(tenantId, async (tx) => {
      const rows = await tx.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
      return rows.map(apiKeyFromRow);
    });
  }

  findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.apiKey.findFirst({ where: { keyHash, isActive: true } });
      return row ? apiKeyFromRow(row) : null;
    });
  }

  save(apiKey: ApiKey): Promise<void> {
    return this.context.withTenant(apiKey.tenantId, async (tx) => {
      await saveApiKey(tx, apiKey);
    });
  }

  saveMany(apiKeys: ApiKey[]): Promise<void> {
    if (apiKeys.length === 0) return Promise.resolve();
    const tenantIds = new Set(apiKeys.map((key) => key.tenantId));
    if (tenantIds.size !== 1) throw new Error('saveMany requiere API keys de un solo tenant.');
    return this.context.withTenant(apiKeys[0].tenantId, async (tx) => {
      for (const key of apiKeys) await saveApiKey(tx, key);
    });
  }
}

function saveApiKey(tx: TenantTx, apiKey: ApiKey): Promise<unknown> {
  const data = {
    tenantId: apiKey.tenantId,
    name: apiKey.name,
    type: apiKey.type,
    keyPrefix: apiKey.keyPrefix,
    keyHash: apiKey.keyHash,
    maskedKey: apiKey.maskedKey,
    isActive: apiKey.isActive,
    expiresAt: apiKey.expiresAt ?? null,
    lastUsedAt: apiKey.lastUsedAt ?? null,
    updatedAt: apiKey.updatedAt,
  };
  return tx.apiKey.upsert({ where: { id: apiKey.id }, create: { id: apiKey.id, ...data }, update: data });
}

function tenantFromRow(row: { id: string; name: string; taxId: string; contactEmail: string; status: Tenant['status']; plan: Tenant['plan']; webhookUrl: string | null; metadata: Prisma.JsonValue; createdAt: Date; updatedAt: Date }): Tenant {
  return Tenant.reconstitute({
    name: row.name, taxId: row.taxId, contactEmail: row.contactEmail, status: row.status, plan: row.plan,
    webhookUrl: row.webhookUrl ?? undefined,
    metadata: row.metadata !== null && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
  }, row.id, row.createdAt, row.updatedAt);
}

function userFromRow(row: { id: string; tenantId: string; email: string; name: string | null; role: User['role']; status: User['status']; invitationTokenHash: string | null; invitationExpiresAt: Date | null; passwordHash: string | null; createdAt: Date; updatedAt: Date }): User {
  return User.reconstitute({
    tenantId: row.tenantId, email: row.email, name: row.name ?? undefined, role: row.role, status: row.status,
    invitationTokenHash: row.invitationTokenHash ?? undefined,
    invitationExpiresAt: row.invitationExpiresAt ?? undefined,
    passwordHash: row.passwordHash ?? undefined,
  }, row.id, row.createdAt, row.updatedAt);
}

function apiKeyFromRow(row: { id: string; tenantId: string; name: string; type: ApiKey['type']; keyPrefix: string; keyHash: string; maskedKey: string; isActive: boolean; expiresAt: Date | null; lastUsedAt: Date | null; createdAt: Date; updatedAt: Date }): ApiKey {
  return ApiKey.reconstitute({
    tenantId: row.tenantId, name: row.name, type: row.type, keyPrefix: row.keyPrefix, keyHash: row.keyHash,
    maskedKey: row.maskedKey, isActive: row.isActive, expiresAt: row.expiresAt ?? undefined,
    lastUsedAt: row.lastUsedAt ?? undefined,
  }, row.id, row.createdAt, row.updatedAt);
}
