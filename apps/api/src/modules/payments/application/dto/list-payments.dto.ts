import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaymentResponseDto } from './payment-response.dto';

export class ListPaymentsQueryDto {
  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Número de página (base 1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    required: false,
    default: 25,
    minimum: 1,
    maximum: 100,
    description: 'Cantidad de elementos por página (máx. 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @ApiProperty({
    required: false,
    enum: [
      'pending',
      'approved',
      'rejected',
      'failed',
      'expired',
      'refunded',
      'partially_refunded',
    ],
    description: 'Filtrar por estado exacto del pago',
  })
  @IsOptional()
  @IsIn([
    'pending',
    'approved',
    'rejected',
    'failed',
    'expired',
    'refunded',
    'partially_refunded',
  ])
  status?: string;

  @ApiProperty({
    required: false,
    description: 'Fecha inicial inclusiva sobre createdAt en formato ISO 8601 UTC',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    required: false,
    description: 'Fecha final exclusiva sobre createdAt en formato ISO 8601 UTC',
    example: '2026-10-16T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    example: 'card',
    description: 'Método de pago (card, qr, bank_transfer)',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiProperty({
    required: false,
    enum: ['sandbox', 'production'],
    description: 'Ambiente de procesamiento',
  })
  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';

  @ApiProperty({
    required: false,
    description: 'Búsqueda por referencia del comercio o UUID del pago',
    example: 'ORDEN-1001',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    default: 'createdAt',
    enum: ['createdAt', 'amount', 'status'],
    description: 'Campo de ordenamiento',
  })
  @IsOptional()
  @IsIn(['createdAt', 'amount', 'status'])
  sortBy: 'createdAt' | 'amount' | 'status' = 'createdAt';

  @ApiProperty({
    required: false,
    default: 'desc',
    enum: ['asc', 'desc'],
    description: 'Dirección del ordenamiento',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class ListPaymentsResponseDto {
  @ApiProperty({
    type: [PaymentResponseDto],
    description: 'Colección de pagos recuperados para el tenant',
  })
  data!: PaymentResponseDto[];

  @ApiProperty({ example: 1, description: 'Página actual' })
  page!: number;

  @ApiProperty({ example: 25, description: 'Límite por página solicitado' })
  limit!: number;

  @ApiProperty({ example: 42, description: 'Total de pagos coincidentes' })
  total!: number;

  @ApiProperty({ example: 2, description: 'Total de páginas calculadas' })
  totalPages!: number;
}
