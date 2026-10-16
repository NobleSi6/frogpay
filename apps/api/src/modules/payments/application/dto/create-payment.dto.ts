import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Monto del pago como string decimal mayor a 0 (ej. "150.00")',
    example: '150.00',
  })
  @IsString({ message: 'amount debe ser un string decimal.' })
  @IsNotEmpty({ message: 'amount es obligatorio.' })
  @Matches(/^(?!0+(?:\.0+)?$)\d+(\.\d{1,2})?$/, {
    message: 'amount debe ser un número decimal mayor a cero con hasta 2 decimales.',
  })
  amount!: string;

  @ApiProperty({
    description: 'Código de moneda ISO 4217. "BOB" para el MVP.',
    example: 'BOB',
  })
  @IsString({ message: 'currency debe ser una cadena.' })
  @IsNotEmpty({ message: 'currency es obligatorio.' })
  @IsIn(['BOB'], {
    message: 'currency debe ser BOB en este sprint.',
  })
  currency!: string;

  @ApiProperty({
    description: 'Código del método de pago soportado por un adapter habilitado.',
    example: 'card',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'paymentMethod debe ser una cadena.' })
  @IsNotEmpty({ message: 'paymentMethod es obligatorio.' })
  paymentMethod!: string;

  @ApiProperty({
    description: 'Referencia libre del comercio (número de orden, etc.)',
    example: 'orden-4471',
    maxLength: 255,
  })
  @IsString({ message: 'merchantReference debe ser una cadena.' })
  @IsNotEmpty({ message: 'merchantReference es obligatorio.' })
  @MaxLength(255, {
    message: 'merchantReference no puede exceder los 255 caracteres.',
  })
  merchantReference!: string;

  @ApiProperty({
    description: 'Token pm_... entregado por Stripe Elements.',
    example: 'pm_1Nk000000000000000000000',
    required: false,
  })
  @ValidateIf((o: CreatePaymentDto) => o.paymentToken !== undefined)
  @IsString({ message: 'paymentToken debe ser una cadena.' })
  @IsNotEmpty({ message: 'paymentToken es obligatorio para el método "card".' })
  @Matches(/^pm_[a-zA-Z0-9_]+$/, {
    message: 'paymentToken debe tener el formato pm_... válido de Stripe.',
  })
  paymentToken?: string;
}
