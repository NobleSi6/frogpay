import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, type EmailSender } from '../../../../shared/email/email-sender.interface';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.interface';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import type { InviteTenantUserDto, TenantUserResponseDto } from '../dto/tenant-user.dto';

@Injectable()
export class InviteTenantUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    private readonly config: ConfigService,
  ) {}

  async execute(tenantId: string, dto: InviteTenantUserDto): Promise<TenantUserResponseDto> {
    if (await this.users.findByTenantEmail(tenantId, dto.email)) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new ConflictException('El tenant no existe');

    const user = User.createInvitedTenantUser(
      tenantId,
      dto.email,
      dto.role,
      dto.name?.trim() || undefined,
    );
    const rawToken = CryptoUtil.generateSecureToken(32);
    user.issueInvitation(CryptoUtil.hashString(rawToken), 72);
    await this.users.save(user);

    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:3000';
    const invitationUrl = new URL(`/activar-cuenta/${rawToken}`, frontendUrl);
    invitationUrl.searchParams.set('email', user.email.value);
    await this.emailSender.sendInvitation({
      to: user.email.value,
      tenantName: tenant.name,
      invitationUrl: invitationUrl.toString(),
      expiresAt: user.invitationExpiresAt!,
    });

    return toResponse(user);
  }
}

export function toResponse(user: User): TenantUserResponseDto {
  return {
    id: user.id,
    email: user.email.value,
    name: user.name ?? null,
    role: user.role as TenantUserResponseDto['role'],
    status: user.status,
  };
}
