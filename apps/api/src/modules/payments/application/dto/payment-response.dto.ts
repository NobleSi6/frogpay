import { ApiProperty } from '@nestjs/swagger';

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export class PaymentResponseDto {
  @ApiProperty({ example: '6f1b2e34-5678-90ab-cdef-1234567890ab' })
  id!: string;

  @ApiProperty({
    example: 'approved',
    enum: ['approved', 'rejected', 'failed'],
    description: 'Estado final del intento de pago',
  })
  status!: PaymentStatus;

  @ApiProperty({ example: '150.00' })
  amount!: string;

  @ApiProperty({ example: 'BOB' })
  currency!: string;

  @ApiProperty({ example: 'card' })
  paymentMethod!: string;

  @ApiProperty({ example: 'sandbox', enum: ['sandbox', 'production'] })
  environment!: 'sandbox' | 'production';

  @ApiProperty({ example: 'orden-4471' })
  merchantReference!: string;

  @ApiProperty({
    example: '5.25',
    nullable: true,
    description: 'Comisión calculada según el plan del tenant. Null si el pago fue rechazado o falló.',
  })
  commissionAmount!: string | null;

  @ApiProperty({
    example: '144.75',
    nullable: true,
    description: 'Monto neto resultante (amount - commissionAmount). Null si el pago no se concretó.',
  })
  netAmount!: string | null;

  @ApiProperty({
    example: 'pi_3Nk000000000000000000000',
    nullable: true,
    description: 'ID de la transacción devuelto por la pasarela externa (ej. Stripe)',
  })
  providerTransactionId!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Código de error estandarizado del catálogo de errores si el pago fue rechazado o falló.',
  })
  errorCode!: string | null;

  @ApiProperty({ example: '2026-10-01T14:32:10.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-10-01T14:32:11.000Z' })
  updatedAt!: string;
}
