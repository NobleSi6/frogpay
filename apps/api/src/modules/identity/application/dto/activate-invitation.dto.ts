import { IsEmail, IsString, MinLength } from 'class-validator';

export class ActivateInvitationDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(32)
  token: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  password: string;
}
