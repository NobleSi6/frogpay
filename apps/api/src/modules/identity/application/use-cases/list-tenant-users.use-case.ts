import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../domain/repositories/user.repository.interface';
import type { TenantUserResponseDto } from '../dto/tenant-user.dto';
import { toResponse } from './invite-tenant-user.use-case';

@Injectable()
export class ListTenantUsersUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: IUserRepository) {}

  async execute(tenantId: string): Promise<TenantUserResponseDto[]> {
    return (await this.users.listByTenant(tenantId)).map(toResponse);
  }
}
