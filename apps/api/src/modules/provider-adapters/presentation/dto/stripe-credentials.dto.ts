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

export class StripeCredentialsResponseDto {
  @ApiProperty({ enum: ['sandbox', 'production'], example: 'sandbox' })
  environment!: 'sandbox' | 'production';

  @ApiProperty({ example: true })
  configured!: boolean;

  @ApiProperty({ nullable: true, example: 'pk_test_example' })
  publishableKey!: string | null;

  @ApiProperty({ nullable: true, example: 'sk_test_...1234' })
  secretKeyMasked!: string | null;
}