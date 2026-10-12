import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class BankDepositSimulationDto {
  @ApiProperty({
    description: 'Referencia bancaria asociada al pago (ej. "BT-2026-A81F92")',
    example: 'BT-2026-A81F92',
  })
  @IsString({ message: 'reference debe ser una cadena.' })
  @IsNotEmpty({ message: 'reference es obligatorio.' })
  reference!: string;

  @ApiProperty({
    description: 'Monto del depósito como string decimal mayor a 0 (ej. "150.00")',
    example: '150.00',
  })
  @IsString({ message: 'amount debe ser un string decimal.' })
  @IsNotEmpty({ message: 'amount es obligatorio.' })
  @Matches(/^(?!0+(?:\.0+)?$)\d+(\.\d{1,2})?$/, {
    message: 'amount debe ser un número decimal mayor a cero con hasta 2 decimales.',
  })
  amount!: string;

  @ApiProperty({
    description: 'Código de moneda ISO 4217 ("BOB")',
    example: 'BOB',
  })
  @IsString({ message: 'currency debe ser una cadena.' })
  @IsNotEmpty({ message: 'currency es obligatorio.' })
  currency!: string;

  @ApiProperty({
    description: 'Nombre del banco origen del depósito simulado',
    example: 'Banco de Prueba',
  })
  @IsString({ message: 'bankName debe ser una cadena.' })
  @IsNotEmpty({ message: 'bankName es obligatorio.' })
  bankName!: string;

  @ApiProperty({
    description: 'Identificador único opcional para idempotencia del depósito',
    example: 'DEP-987654',
    required: false,
  })
  @IsString({ message: 'depositId debe ser una cadena.' })
  @IsOptional()
  depositId?: string;
}

export class DashboardSimulateDepositDto {
  @ApiProperty({
    description:
      'Modo de simulación: "exact" (monto correcto), "amount_mismatch" (monto diferente), "reference_not_found" (referencia inexistente)',
    enum: ['exact', 'amount_mismatch', 'reference_not_found'],
    example: 'exact',
  })
  @IsString({ message: 'mode debe ser una cadena.' })
  @IsNotEmpty({ message: 'mode es obligatorio.' })
  @IsIn(['exact', 'amount_mismatch', 'reference_not_found'], {
    message:
      'mode debe ser "exact", "amount_mismatch" o "reference_not_found".',
  })
  mode!: 'exact' | 'amount_mismatch' | 'reference_not_found';
}

export class BankDepositSimulationResponseDto {
  @ApiProperty({
    example: 'reconciled',
    enum: ['reconciled', 'amount_mismatch', 'unmatched'],
  })
  status!: 'reconciled' | 'amount_mismatch' | 'unmatched';

  @ApiProperty({ example: '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391' })
  depositId!: string;

  @ApiProperty({
    example: '7b3c9a12-e2fb-5a84-c0af-75d618fe8402',
    nullable: true,
  })
  paymentId?: string;

  @ApiProperty({
    example: null,
    nullable: true,
  })
  errorCode?: string;
}
