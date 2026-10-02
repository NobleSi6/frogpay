import { Tenant } from '../entities/tenant.entity';

export interface TenantListRecord {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  ownerEmail: string;
}

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findByTaxId(taxId: string): Promise<Tenant | null>;
  findByName(name: string): Promise<Tenant | null>;
  listAll(): Promise<TenantListRecord[]>;
  save(tenant: Tenant): Promise<void>;
}
