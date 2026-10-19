import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const TENANT_USER_ROLES = ['OWNER', 'OPERATOR', 'VIEWER'] as const;
export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];

export class InviteTenantUserDto {
  @ApiProperty({ example: 'operator@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: TENANT_USER_ROLES, example: 'OPERATOR' })
  @IsIn(TENANT_USER_ROLES)
  role!: TenantUserRole;

  @ApiProperty({ required: false, example: 'Ana Operadora' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class TenantUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ enum: TENANT_USER_ROLES })
  role!: TenantUserRole;

  @ApiProperty({ enum: ['invited', 'active', 'suspended'] })
  status!: string;
}
