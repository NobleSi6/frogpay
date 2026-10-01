import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/repositories/user.repository.interface';
import { TENANT_REPOSITORY, type ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import type { AuthenticatedUser } from '../../../../shared/auth/auth.types';
import type { AuthenticatedUserDto } from '../dto/login.dto';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
  ) {}

  async execute(identity: AuthenticatedUser): Promise<AuthenticatedUserDto> {
    const user = await this.users.findById(identity.id);
    if (!user || user.status !== 'active') throw new UnauthorizedException('La sesión ya no es válida');
    const tenant = user.tenantId ? await this.tenants.findById(user.tenantId) : null;
    return { id: user.id, email: user.email.value, role: user.role, ...(tenant ? { tenant: { id: tenant.id, name: tenant.name } } : {}) };
  }
}
