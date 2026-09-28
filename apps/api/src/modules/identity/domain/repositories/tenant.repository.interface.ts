import { Tenant } from '../entities/tenant.entity';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findByTaxId(taxId: string): Promise<Tenant | null>;
  findByName(name: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
}
