import { ApiProperty } from '@nestjs/swagger';

export class PaymentSimulationResponseDto {
  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'failed'] })
  status!: string;

  @ApiProperty()
  changed!: boolean;
}
