import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiKeyType } from '../../domain/entities/api-key.entity';

export class GenerateApiKeyDto {
  @ApiProperty({
    description: 'Nombre descriptivo de la llave (ej. "Producción - App Móvil")',
    example: 'Producción - App Móvil',
    minLength: 2,
    maxLength: 80,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({
    description: 'Tipo de la API Key: "test" para desarrollo, "live" para producción',
    example: 'test',
    enum: ['test', 'live'],
  })
  @IsEnum(['test', 'live'], { message: 'El tipo debe ser "test" o "live"' })
  type: ApiKeyType;

  @ApiPropertyOptional({
    description: 'Fecha de expiración de la llave (ISO 8601). Si se omite, no expira.',
    example: '2027-12-31T23:59:59.000Z',
  })
  @IsOptional()
  expiresAt?: Date;
}
