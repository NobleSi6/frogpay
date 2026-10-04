import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class StripeCredentialsDto {
  @ApiProperty({ example: 'pk_test_example' })
  @IsString()
  @IsNotEmpty()
  publishableKey!: string;

  @ApiProperty({ example: 'sk_test_example' })
  @IsString()
  @IsNotEmpty()
  secretKey!: string;
}