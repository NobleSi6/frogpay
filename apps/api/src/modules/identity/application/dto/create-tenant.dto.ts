import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
} from 'class-validator';

export enum TenantPlanDto {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export class CreateTenantDto {
  @ApiProperty({
    description: 'Nombre legal o comercial de la empresa / tenant',
    example: 'Comercio Express S.R.L.',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  name: string;

  @ApiProperty({
    description: 'NIT o documento de identificación tributaria',
    example: '1028472023',
  })
  @IsString({ message: 'El NIT/identificación tributaria debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El NIT/identificación tributaria es obligatorio' })
  @Matches(/^[A-Za-z0-9-]{5,20}$/, {
    message: 'El NIT debe tener entre 5 y 20 caracteres alfanuméricos',
  })
  taxId: string;

  @ApiProperty({
    description: 'Correo electrónico del propietario/administrador inicial',
    example: 'admin@comercioexpress.com',
  })
  @IsEmail({}, { message: 'El correo electrónico de contacto no tiene un formato válido' })
  @IsNotEmpty({ message: 'El correo electrónico de contacto es obligatorio' })
  contactEmail: string;

  @ApiPropertyOptional({
    description: 'Plan de suscripción inicial',
    enum: TenantPlanDto,
    default: TenantPlanDto.FREE,
  })
  @IsOptional()
  @IsEnum(TenantPlanDto, {
    message: 'El plan debe ser uno de los siguientes: free, starter, pro, enterprise',
  })
  plan?: TenantPlanDto;

  @ApiPropertyOptional({
    description: 'URL de webhook para notificaciones de eventos en tiempo real',
    example: 'https://comercioexpress.com/api/webhooks/frogpay',
  })
  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: 'La URL del webhook debe ser una URL válida' },
  )
  webhookUrl?: string;

  @ApiPropertyOptional({
    description: 'Metadatos adicionales asociados al tenant',
    example: { country: 'BO', currency: 'BOB' },
  })
  @IsOptional()
  @IsObject({ message: 'Los metadatos deben ser un objeto JSON' })
  metadata?: Record<string, unknown>;
}
