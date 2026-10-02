import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { USER_REPOSITORY, type IUserRepository } from '../../domain/repositories/user.repository.interface';
import { TENANT_REPOSITORY, type ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { JwtTokenService } from '../../../../shared/auth/jwt-token.service';
import { LoginDto, type LoginResponseDto } from '../dto/login.dto';

const scrypt = promisify(scryptCallback);

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tokens: JwtTokenService,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.status !== 'active' || !user.passwordHash || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    const tenant = user.tenantId ? await this.tenants.findById(user.tenantId) : null;
    const identity = { id: user.id, email: user.email.value, role: user.role, tenantId: user.tenantId };
    const token = this.tokens.sign(identity);
    return {
      ...token,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email.value,
        role: user.role,
        ...(tenant ? { tenant: { id: tenant.id, name: tenant.name } } : {}),
      },
    };
  }
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expected] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return actual.length === Buffer.from(expected, 'hex').length && actual.equals(Buffer.from(expected, 'hex'));
}
