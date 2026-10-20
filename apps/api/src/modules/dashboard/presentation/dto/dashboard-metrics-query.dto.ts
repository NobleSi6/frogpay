import { Type } from 'class-transformer';
import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DashboardMetricsQueryDto {
  @ApiProperty({ enum: [7, 30], example: 7 })
  @Type(() => Number)
  @IsIn([7, 30])
  days!: 7 | 30;

  @ApiProperty({ enum: ['sandbox', 'production'] })
  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';
}
