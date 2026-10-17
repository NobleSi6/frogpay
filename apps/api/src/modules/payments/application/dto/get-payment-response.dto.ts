import { ApiProperty } from '@nestjs/swagger';
import { BankInstructionsDto, PaymentStatus } from './payment-response.dto';

export class PaymentTransitionDto {
  @ApiProperty({
    example: 'pending',
    nullable: true,
    description: 'Estado previo del pago (null si es el estado inicial de creación)',
  })
  from!: string | null;

  @ApiProperty({
    example: 'approved',
    description: 'Nuevo estado alcanzado en esta transición',
    enum: ['pending', 'approved', 'rejected', 'failed', 'expired', 'refunded', 'partially_refunded'],
  })
  to!: string;

  @ApiProperty({
    example: '2026-10-11T19:00:00.000Z',
    description: 'Marca de tiempo ISO 8601 en UTC del momento de la transición',
  })
  createdAt!: string;

  @ApiProperty({
    example: 'system',
    description: 'Actor o disparador del cambio de estado',
    enum: ['system', 'webhook', 'user', 'simulator', 'worker'],
  })
  actor!: string;
}

export class PaymentStatusHistoryItemDto {
  @ApiProperty({ example: 'pending', nullable: true })
  previousStatus!: string | null;

  @ApiProperty({ example: 'approved' })
  newStatus!: string;

  @ApiProperty({ example: {}, description: 'Metadatos adicionales del cambio de estado' })
  metadata!: Record<string, unknown>;

  @ApiProperty({ example: '2026-10-11T19:00:00.000Z' })
  createdAt!: string;
}

export class GetPaymentResponseDto {
  @ApiProperty({
    example: '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391',
    description: 'UUID identificador único del pago',
  })
  id!: string;

  @ApiProperty({
    example: 'approved',
    enum: ['pending', 'approved', 'rejected', 'failed', 'expired', 'refunded', 'partially_refunded'],
    description: 'Estado actual del pago',
  })
  status!: PaymentStatus;

  @ApiProperty({
    example: '150.00',
    description: 'Monto total del cobro expresado como cadena decimal (2 decimales)',
  })
  amount!: string;

  @ApiProperty({
    example: 'BOB',
    description: 'Código de moneda ISO 4217 de 3 caracteres',
  })
  currency!: string;

  @ApiProperty({
    example: 'bank_transfer',
    enum: ['card', 'qr', 'bank_transfer'],
    description: 'Método de pago utilizado',
  })
  paymentMethod!: string;

  @ApiProperty({
    example: 'ORDEN-1001',
    description: 'Referencia provista por el comercio',
  })
  merchantReference!: string;

  @ApiProperty({
    example: '1.50',
    nullable: true,
    description: 'Comisión cobrada según el plan del tenant (null si el pago no fue aprobado)',
  })
  commissionAmount!: string | null;

  @ApiProperty({
    example: '148.50',
    nullable: true,
    description: 'Monto neto a liquidar al comercio (amount - commissionAmount)',
  })
  netAmount!: string | null;

  @ApiProperty({
    example: 'sandbox',
    enum: ['sandbox', 'production'],
    description: 'Ambiente en el que se procesó el pago',
  })
  environment!: 'sandbox' | 'production';

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Código de error estandarizado del catálogo si fue rechazado o falló',
  })
  errorCode!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Payload EMVCo para pagos con QR. Solo disponible mientras status sea pending.',
  })
  qrPayload!: string | null;

  @ApiProperty({
    type: BankInstructionsDto,
    nullable: true,
    description: 'Instrucciones bancarias para transferencias. Solo disponible mientras status sea pending.',
  })
  bankInstructions!: BankInstructionsDto | null;

  @ApiProperty({
    example: '2026-10-11T19:00:00.000Z',
    description: 'Fecha de creación del pago en formato ISO 8601 UTC',
  })
  createdAt!: string;

  @ApiProperty({
    example: '2026-10-11T19:05:00.000Z',
    description: 'Fecha de última actualización en formato ISO 8601 UTC',
  })
  updatedAt!: string;

  @ApiProperty({
    example: '2026-10-12T19:00:00.000Z',
    nullable: true,
    description: 'Fecha de expiración para pagos pendientes (transferencia o QR)',
  })
  expiresAt!: string | null;

  @ApiProperty({
    type: [PaymentTransitionDto],
    description: 'Línea de tiempo cronológica de transiciones de estado del pago',
  })
  transitions!: PaymentTransitionDto[];

  @ApiProperty({
    type: [PaymentStatusHistoryItemDto],
    required: false,
    description: 'Compatibilidad con clientes que consumen statusHistory (RFC-302)',
  })
  statusHistory?: PaymentStatusHistoryItemDto[];
}
