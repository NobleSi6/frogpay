import { ApiProperty } from '@nestjs/swagger';
import type { ProviderProcessingMode } from '../../../provider-adapters/ports/payment-provider.port';

export class DashboardPaymentMethodDto {
  @ApiProperty({ example: 'card' })
  code!: string;

  @ApiProperty({ example: 'Tarjeta' })
  label!: string;

  @ApiProperty({ enum: ['synchronous', 'asynchronous'], example: 'synchronous' })
  processingMode!: ProviderProcessingMode;

  @ApiProperty({ example: true })
  requiresPaymentToken!: boolean;
}
