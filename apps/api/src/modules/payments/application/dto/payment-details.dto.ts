import { ApiProperty } from '@nestjs/swagger';
import { PaymentResponseDto } from './payment-response.dto';

export class PaymentStatusHistoryItemDto {
  @ApiProperty({ example: 'pending', nullable: true })
  previousStatus!: string | null;

  @ApiProperty({ example: 'approved' })
  newStatus!: string;

  @ApiProperty({ example: {}, description: 'Metadatos adicionales del cambio de estado' })
  metadata!: Record<string, unknown>;

  @ApiProperty({ example: '2026-10-01T14:32:10.000Z' })
  createdAt!: string;
}

export class PaymentDetailsResponseDto extends PaymentResponseDto {
  @ApiProperty({
    type: [PaymentStatusHistoryItemDto],
    description: 'Historial cronológico de transiciones de estado del pago',
  })
  statusHistory!: PaymentStatusHistoryItemDto[];
}
