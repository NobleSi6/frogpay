import { Injectable } from '@nestjs/common';
import { ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { Tenant } from '../../domain/entities/tenant.entity';

/**
 * Implementación In-Memory de ITenantRepository.
 * Proporciona almacenamiento en memoria para desarrollo y pruebas,
 * preparado con la estructura necesaria para migrar transparentemente a Prisma/PostgreSQL.
 */
@Injectable()
export class InMemoryTenantRepository implements ITenantRepository {
  private readonly items: Map<string, Tenant> = new Map();

  async findById(id: string): Promise<Tenant | null> {
    const tenant = this.items.get(id);
    return tenant ? tenant : null;
  }

  async findByTaxId(taxId: string): Promise<Tenant | null> {
    const cleanTaxId = taxId.trim().toUpperCase();
    for (const tenant of this.items.values()) {
      if (tenant.taxId.value === cleanTaxId) {
        return tenant;
      }
    }
    return null;
  }

  async findByName(name: string): Promise<Tenant | null> {
    const cleanName = name.trim().toLowerCase();
    for (const tenant of this.items.values()) {
      if (tenant.name.toLowerCase() === cleanName) {
        return tenant;
      }
    }
    return null;
  }

  async save(tenant: Tenant): Promise<void> {
    this.items.set(tenant.id, tenant);
  }

  async listAll() {
    return [...this.items.values()].map((tenant) => ({ id: tenant.id, name: tenant.name, status: tenant.status, createdAt: tenant.createdAt, ownerEmail: tenant.contactEmail.value }));
  }

  /**
   * Utilidad para tests: limpiar el estado del repositorio
   */
  public clear(): void {
    this.items.clear();
  }
}
