import { ApiProperty } from '@nestjs/swagger';
import { PaymentDetailsResponseDto } from './payment-details.dto';

export class DashboardPaymentWebhookDeliveryDto {
  @ApiProperty({ example: 'f7e9fbaa-ef25-4a1e-9e88-c9f55a4bf5c4' })
  id!: string;

  @ApiProperty({ example: 'cd88e9d8-7eec-4cca-a142-3946e19980ef' })
  webhookId!: string;

  @ApiProperty({ example: 'delivered', enum: ['pending', 'delivered', 'failed', 'dead_letter'] })
  status!: string;

  @ApiProperty({ example: 1 })
  attemptCount!: number;

  @ApiProperty({ example: '2026-10-16T10:15:00.000Z', nullable: true })
  lastAttemptAt!: string | null;

  @ApiProperty({ example: null, nullable: true })
  nextAttemptAt!: string | null;

  @ApiProperty({ example: '2026-10-16T10:14:58.000Z' })
  createdAt!: string;
}

export class DashboardPaymentDetailsResponseDto extends PaymentDetailsResponseDto {
  @ApiProperty({
    type: [DashboardPaymentWebhookDeliveryDto],
    description: 'Entregas de webhooks asociadas al pago (sin URLs ni payloads confidenciales)',
  })
  webhookDeliveries!: DashboardPaymentWebhookDeliveryDto[];
}
