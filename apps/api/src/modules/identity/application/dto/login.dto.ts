import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import type { UserRole } from '../../domain/entities/user.entity';

export class LoginDto {
  @ApiProperty({ example: 'owner@empresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AuthenticatedUserDto {
  id: string;
  email: string;
  role: UserRole;
  tenant?: { id: string; name: string };
}

export class LoginResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthenticatedUserDto;
}
