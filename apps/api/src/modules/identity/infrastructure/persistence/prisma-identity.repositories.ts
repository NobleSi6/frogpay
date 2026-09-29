import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService, TenantTx } from '../../../../shared/database/prisma-tenant-context.service';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { Tenant } from '../../domain/entities/tenant.entity';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/entities/user.entity';
import { IApiKeyRepository } from '../../domain/repositories/api-key.repository.interface';
import { ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';

type TenantWithPlan = Prisma.tenantGetPayload<{ include: { plan: true } }>;
type UserWithRole = Prisma.app_userGetPayload<{ include: { role: true } }>;
type ApiKeyRow = Prisma.api_keyGetPayload<{}>;

const planNames: Record<Tenant['plan'], string> = {
  free: 'Free',
  premium: 'Premium',
};

const roleNames: Record<UserRole, string> = {
  PLATFORM_ADMIN: 'platform_admin',
  OWNER: 'tenant_owner',
  ADMIN: 'tenant_admin',
  DEVELOPER: 'tenant_developer',
  FINANCE: 'tenant_finance',
  SUPPORT: 'tenant_support',
};

@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly context: PrismaTenantContextService) {}

  findById(id: string): Promise<Tenant | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.tenant.findUnique({ where: { id }, include: { plan: true } });
      return row ? tenantFromRow(row) : null;
    });
  }

  findByTaxId(taxId: string): Promise<Tenant | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.tenant.findUnique({
        where: { tax_id: taxId.trim().toUpperCase() },
        include: { plan: true },
      });
      return row ? tenantFromRow(row) : null;
    });
  }

  findByName(name: string): Promise<Tenant | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.tenant.findFirst({
        where: { name: { equals: name.trim(), mode: 'insensitive' } },
        include: { plan: true },
      });
      return row ? tenantFromRow(row) : null;
    });
  }

  save(tenant: Tenant): Promise<void> {
    return this.context.withGlobalAccess(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { name: planNames[tenant.plan] } });
      if (!plan) throw new Error(`No existe el plan ${planNames[tenant.plan]} en el catálogo.`);
      const data = {
        name: tenant.name,
        business_name: tenant.name,
        tax_id: tenant.taxId.value,
        contact_email: tenant.contactEmail.value,
        status: tenant.status,
        plan_id: plan.id,
        webhook_url: tenant.webhookUrl ?? null,
        metadata: (tenant.metadata ?? {}) as Prisma.InputJsonValue,
        updated_at: tenant.updatedAt,
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
      const row = await tx.app_user.findUnique({ where: { id }, include: { role: true } });
      return row ? userFromRow(row) : null;
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.app_user.findFirst({
        where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } },
        include: { role: true },
      });
      return row ? userFromRow(row) : null;
    });
  }

  findByInvitationTokenHash(tokenHash: string): Promise<User | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.app_user.findFirst({
        where: { invitation_token: tokenHash },
        include: { role: true },
      });
      return row ? userFromRow(row) : null;
    });
  }

  save(user: User): Promise<void> {
    return this.context.withGlobalAccess(async (tx) => {
      const role = await tx.role.findUnique({ where: { name: roleNames[user.role] } });
      if (!role) throw new Error(`No existe el rol ${roleNames[user.role]} en el catálogo.`);
      const data = {
        tenant_id: user.tenantId,
        role_id: role.id,
        email: user.email.value,
        name: user.name ?? null,
        status: user.status,
        invitation_token: user.invitationTokenHash ?? null,
        invitation_expires_at: user.invitationExpiresAt ?? null,
        password_hash: user.passwordHash ?? null,
        updated_at: user.updatedAt,
      };
      await tx.app_user.upsert({ where: { id: user.id }, create: { id: user.id, ...data }, update: data });
    });
  }
}

@Injectable()
export class PrismaApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly context: PrismaTenantContextService) {}

  findById(id: string): Promise<ApiKey | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.api_key.findUnique({ where: { id } });
      return row ? apiKeyFromRow(row) : null;
    });
  }

  findByTenantId(tenantId: string): Promise<ApiKey[]> {
    return this.context.withTenant(tenantId, async (tx) => {
      const rows = await tx.api_key.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'asc' } });
      return rows.map(apiKeyFromRow);
    });
  }

  findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    return this.context.withGlobalAccess(async (tx) => {
      const row = await tx.api_key.findFirst({ where: { secret_hash: keyHash, status: 'active' } });
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
    tenant_id: apiKey.tenantId,
    name: apiKey.name,
    environment: apiKey.type === 'test' ? 'sandbox' : 'production',
    key_prefix: apiKey.keyPrefix,
    secret_hash: apiKey.keyHash,
    masked_key: apiKey.maskedKey,
    status: apiKey.isActive ? 'active' : 'revoked',
    expires_at: apiKey.expiresAt ?? null,
    last_used_at: apiKey.lastUsedAt ?? null,
    revoked_at: apiKey.isActive ? null : apiKey.updatedAt,
    updated_at: apiKey.updatedAt,
  };
  return tx.api_key.upsert({ where: { id: apiKey.id }, create: { id: apiKey.id, ...data }, update: data });
}

function tenantFromRow(row: TenantWithPlan): Tenant {
  if (!row.contact_email) throw new Error(`El tenant ${row.id} no tiene correo de contacto.`);
  return Tenant.reconstitute({
    name: row.business_name || row.name,
    taxId: row.tax_id,
    contactEmail: row.contact_email,
    status: tenantStatusFromRow(row.status),
    plan: tenantPlanFromRow(row.plan?.name),
    webhookUrl: row.webhook_url ?? undefined,
    metadata: row.metadata !== null && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
  }, row.id, row.created_at, row.updated_at);
}

function userFromRow(row: UserWithRole): User {
  if (!row.tenant_id) throw new Error(`El usuario ${row.id} no pertenece a un tenant.`);
  return User.reconstitute({
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name ?? undefined,
    role: userRoleFromRow(row.role.name),
    status: userStatusFromRow(row.status),
    invitationTokenHash: row.invitation_token ?? undefined,
    invitationExpiresAt: row.invitation_expires_at ?? undefined,
    passwordHash: row.password_hash ?? undefined,
  }, row.id, row.created_at, row.updated_at);
}

function apiKeyFromRow(row: ApiKeyRow): ApiKey {
  return ApiKey.reconstitute({
    tenantId: row.tenant_id,
    name: row.name ?? '',
    type: apiKeyTypeFromRow(row.environment),
    keyPrefix: row.key_prefix,
    keyHash: row.secret_hash,
    maskedKey: row.masked_key,
    isActive: row.status === 'active',
    expiresAt: row.expires_at ?? undefined,
    lastUsedAt: row.last_used_at ?? undefined,
  }, row.id, row.created_at, row.updated_at);
}

function tenantPlanFromRow(name: string | undefined): Tenant['plan'] {
  const normalizedName = name?.toLowerCase() ?? 'free';
  if (normalizedName === 'free' || normalizedName === 'premium') return normalizedName;
  throw new Error(`El plan ${name} no está soportado por la API.`);
}

function tenantStatusFromRow(status: string): Tenant['status'] {
  if (['active', 'inactive', 'suspended', 'invited'].includes(status)) {
    return status as Tenant['status'];
  }
  throw new Error(`El estado del tenant ${status} no está soportado por la API.`);
}

function userStatusFromRow(status: string): User['status'] {
  if (status === 'disabled') return 'suspended';
  if (['invited', 'active', 'suspended'].includes(status)) {
    return status as User['status'];
  }
  throw new Error(`El estado del usuario ${status} no está soportado por la API.`);
}

function userRoleFromRow(name: string): UserRole {
  const roles: Record<string, UserRole> = {
    platform_admin: 'PLATFORM_ADMIN',
    tenant_owner: 'OWNER',
    tenant_admin: 'ADMIN',
    tenant_developer: 'DEVELOPER',
    tenant_finance: 'FINANCE',
    tenant_support: 'SUPPORT',
  };
  const role = roles[name];
  if (!role) throw new Error(`El rol ${name} no está soportado por la API.`);
  return role;
}

function apiKeyTypeFromRow(environment: string): ApiKey['type'] {
  if (environment === 'sandbox') return 'test';
  if (environment === 'production') return 'live';
  throw new Error(`El entorno de API key ${environment} no está soportado.`);
}
