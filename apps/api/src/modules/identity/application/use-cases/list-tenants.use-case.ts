import { Inject, Injectable } from '@nestjs/common';
import { TENANT_REPOSITORY, type ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import type { TenantListResponseDto } from '../dto/tenant-list-response.dto';

@Injectable()
export class ListTenantsUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(): Promise<TenantListResponseDto[]> {
    return (await this.tenants.listAll()).map(({ id, name, status, createdAt, ownerEmail }) => ({
      id,
      name,
      ownerEmail,
      status,
      createdAt,
    }));
  }
}
