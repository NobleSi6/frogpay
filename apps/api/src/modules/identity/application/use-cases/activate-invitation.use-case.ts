import { randomBytes, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import { ActivateInvitationDto } from '../dto/activate-invitation.dto';

const scrypt = promisify(scryptCallback);

@Injectable()
export class ActivateInvitationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: ActivateInvitationDto): Promise<{ message: string }> {
    const user = await this.userRepository.findByInvitationTokenHash(
      CryptoUtil.hashString(dto.token),
    );
    if (!user || user.email.value !== dto.email.trim().toLowerCase() || !user.isInvitationValid()) {
      throw new BadRequestException('La invitación es inválida, expiró o ya fue utilizada');
    }

    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(dto.password, salt, 64)) as Buffer;
    const passwordHash = `scrypt$${salt}$${derivedKey.toString('hex')}`;
    user.activate(passwordHash);
    await this.userRepository.save(user);

    return { message: 'Cuenta activada. Ya puedes iniciar sesión.' };
  }
}
