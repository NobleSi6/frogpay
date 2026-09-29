import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({
    description: 'ID único de la API Key',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'ID del tenant al que pertenece',
    example: 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Nombre descriptivo de la llave',
    example: 'Producción - App Móvil',
  })
  name: string;

  @ApiProperty({
    description: 'Tipo de la llave',
    enum: ['test', 'live'],
    example: 'test',
  })
  type: 'test' | 'live';

  @ApiProperty({
    description: 'Prefijo identificador de la llave',
    example: 'fp_test_3a8f',
  })
  keyPrefix: string;

  @ApiProperty({
    description: 'Representación enmascarada para visualización segura en el dashboard',
    example: 'fp_test_3a8f...0d1e',
  })
  maskedKey: string;

  @ApiProperty({
    description: 'Indica si la llave está activa',
    example: true,
  })
  isActive: boolean;

  @ApiPropertyOptional({
    description: 'Fecha de expiración de la llave (null si no expira)',
    example: '2027-12-31T23:59:59.000Z',
  })
  expiresAt?: Date;

  @ApiPropertyOptional({
    description: 'Última vez que se utilizó la llave',
    example: '2026-09-28T10:30:00.000Z',
  })
  lastUsedAt?: Date;

  @ApiProperty({
    description: 'Fecha de creación',
    example: '2026-09-28T15:00:00.000Z',
  })
  createdAt: Date;
}

/**
 * DTO de respuesta al crear una nueva API Key.
 * Incluye rawKey que solo se muestra una vez.
 */
export class GeneratedApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    description:
      'Llave secreta en texto plano. ¡IMPORTANTE! Solo se muestra una vez al momento de creación. Almacénela de forma segura.',
    example: 'fp_test_3a8f9c0b1e2d4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
  })
  rawKey: string;
}
