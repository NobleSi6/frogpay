import { ApiKey } from '../../domain/entities/api-key.entity';
import { Tenant } from '../../domain/entities/tenant.entity';
import { User } from '../../domain/entities/user.entity';
import { TenantCreatedEvent } from '../../domain/events/tenant-created.event';

export const TENANT_REGISTRATION_REPOSITORY = Symbol('TENANT_REGISTRATION_REPOSITORY');

export interface TenantRegistrationRepository {
  save(tenant: Tenant, owner: User, apiKeys: ApiKey[], event: TenantCreatedEvent): Promise<void>;
}