import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { QrSimulationResult } from '../payment-simulation.service';

export class SimulateQrPaymentDto {
  @ApiProperty({ enum: ['APPROVED', 'FAILED'], example: 'APPROVED' })
  @IsIn(['APPROVED', 'FAILED'])
  result!: QrSimulationResult;
}
