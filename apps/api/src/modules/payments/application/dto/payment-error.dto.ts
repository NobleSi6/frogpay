import { ApiProperty } from '@nestjs/swagger';

export class PaymentErrorResponseDto {
  @ApiProperty({
    example: 'validation_error',
    description: 'Código de error estandarizado de FrogPay',
  })
  code!: string;

  @ApiProperty({
    example: 'El monto debe ser mayor a cero.',
    description: 'Mensaje descriptivo del error en español',
  })
  message!: string;

  @ApiProperty({
    example: { field: 'amount' },
    nullable: true,
    required: false,
    description: 'Detalles específicos del error si corresponde',
  })
  details?: Record<string, unknown> | null;

  @ApiProperty({
    example: 'req_8a1c90ef1234',
    description: 'Identificador único de la petición para correlación con logs',
  })
  requestId!: string;
}
