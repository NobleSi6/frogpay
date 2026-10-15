import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import type { QrSimulationResult } from '../payment-simulation.service';

export class QrCallbackDto {
  @ApiProperty({ format: 'uuid', name: 'payment_id' })
  @IsUUID()
  payment_id!: string;

  @ApiProperty({ enum: ['APPROVED', 'FAILED'], example: 'APPROVED' })
  @IsIn(['APPROVED', 'FAILED'])
  result!: QrSimulationResult;
}
