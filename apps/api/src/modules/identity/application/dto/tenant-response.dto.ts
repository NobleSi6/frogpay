import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratedApiKeyDto {
  @ApiProperty({
    description: 'Tipo de llave de API',
    example: 'test',
    enum: ['test', 'live'],
  })
  type: 'test' | 'live';

  @ApiProperty({
    description:
      'Llave secreta completa en texto plano. ¡IMPORTANTE! Solo se muestra una vez al momento de creación.',
    example: 'fp_test_3a8f9c0b1e2d4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
  })
  rawKey: string;

  @ApiProperty({
    description: 'Prefijo identificador de la llave',
    example: 'fp_test_3a8f',
  })
  keyPrefix: string;

  @ApiProperty({
    description: 'Representación enmascarada para consulta segura en dashboard',
    example: 'fp_test_3a8f...0d1e',
  })
  maskedKey: string;
}

export class OwnerInvitationDto {
  @ApiProperty({
    description: 'ID de usuario del propietario generado',
    example: 'd3b07384-d113-4a6c-9c76-5a4d6f8e2e1a',
  })
  userId: string;

  @ApiProperty({
    description: 'Correo electrónico del propietario invitado',
    example: 'admin@comercioexpress.com',
  })
  email: string;

  @ApiProperty({
    description: 'Rol asignado',
    example: 'OWNER',
  })
  role: string;

  @ApiProperty({
    description: 'Estado del usuario',
    example: 'invited',
  })
  status: string;

  @ApiProperty({
    description: 'Fecha límite de expiración de la invitación (72 horas)',
    example: '2026-10-01T15:00:00.000Z',
  })
  invitationExpiresAt: Date;
}

export class TenantResponseDto {
  @ApiProperty({
    description: 'ID único del tenant (UUID v4)',
    example: 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b',
  })
  id: string;

  @ApiProperty({
    description: 'Nombre de la empresa',
    example: 'Comercio Express S.R.L.',
  })
  name: string;

  @ApiProperty({
    description: 'NIT / Identificación tributaria',
    example: '1028472023',
  })
  taxId: string;

  @ApiProperty({
    description: 'Correo de contacto principal',
    example: 'admin@comercioexpress.com',
  })
  contactEmail: string;

  @ApiProperty({
    description: 'Plan de suscripción asignado',
    example: 'free',
  })
  plan: string;

  @ApiProperty({
    description: 'Estado del tenant',
    example: 'active',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'URL de webhook configurada',
    example: 'https://comercioexpress.com/api/webhooks/frogpay',
  })
  webhookUrl?: string;

  @ApiPropertyOptional({
    description: 'Metadatos adicionales',
    example: { country: 'BO', currency: 'BOB' },
  })
  metadata?: Record<string, unknown>;

  @ApiProperty({
    description: 'Información de invitación del propietario',
    type: OwnerInvitationDto,
  })
  owner: OwnerInvitationDto;

  @ApiProperty({ description: 'Confirma que se envió el correo de invitación', example: true })
  invitationSent: boolean;

  @ApiProperty({
    description: 'Llaves de API iniciales generadas (Test y Live)',
    type: [GeneratedApiKeyDto],
  })
  apiKeys: GeneratedApiKeyDto[];

  @ApiProperty({
    description: 'Fecha de creación del tenant',
    example: '2026-09-28T15:00:00.000Z',
  })
  createdAt: Date;
}
