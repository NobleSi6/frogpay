import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class InjectProviderFaultDto {
  @ApiProperty({ example: 'stripe', description: 'Id del adaptador (stripe, qr_local, ...)' })
  @IsString()
  @MaxLength(50)
  provider!: string;

  @ApiProperty({ enum: ['error', 'latency'], description: 'error = no responde; latency = responde lento' })
  @IsIn(['error', 'latency'])
  mode!: 'error' | 'latency';

  @ApiProperty({ example: 120, minimum: 1, maximum: 600 })
  @IsInt()
  @Min(1)
  @Max(600)
  durationSeconds!: number;

  @ApiPropertyOptional({ example: 5000, description: 'Solo para latency. Desde 3000 ms el pago termina en timeout.' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  latencyMs?: number;
}

export class ProviderFaultResponseDto {
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: ['error', 'latency'] }) mode!: string;
  @ApiProperty() latencyMs!: number;
  @ApiProperty() until!: string;
}
