import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import { CurrentApiKeyContext } from '../decorators/api-key-context.decorator';
import type { ApiKeyContext } from '../guards/api-key-auth.guard';
import { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import { CreatePaymentDto } from '../../application/dto/create-payment.dto';
import { PaymentResponseDto } from '../../application/dto/payment-response.dto';
import { PaymentDetailsResponseDto } from '../../application/dto/payment-details.dto';
import { PaymentErrorResponseDto } from '../../application/dto/payment-error.dto';

@ApiTags('Pagos Públicos (API)')
@Controller('v1/payments')
@UseGuards(ApiKeyAuthGuard)
export class PaymentsController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un pago con tarjeta (HU-03)',
    description:
      'Crea un nuevo cobro con tarjeta mediante Idempotency-Key. Retorna 201 para nuevos cobros o 200 para reintentos con la misma clave.',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    description: 'API Key del comercio (<key_prefix>.<secret>)',
    required: true,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'UUID único del intento de pago generado por el cliente',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Pago nuevo creado y procesado exitosamente (approved, rejected o failed).',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Reintento idempotente exitoso con la misma clave y cuerpo.',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validación fallida de los campos requeridos.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'API Key faltante, inválida o revocada.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una solicitud en proceso con esta misma clave de idempotencia.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'La clave de idempotencia ya fue usada con un cuerpo de solicitud distinto.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'El tenant superó el límite de volumen mensual de su plan.',
    type: PaymentErrorResponseDto,
  })
  async create(
    @CurrentApiKeyContext() apiKeyContext: ApiKeyContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentResponseDto> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El encabezado Idempotency-Key es obligatorio y debe ser un UUID válido.',
        details: { header: 'Idempotency-Key' },
      });
    }

    const result = await this.createPaymentUseCase.execute(
      apiKeyContext.tenantId,
      apiKeyContext.environment,
      idempotencyKey,
      dto,
    );

    // Si es una repetición idempotente devolvemos 200 OK, si es nuevo 201 Created
    res.status(result.isReplay ? HttpStatus.OK : HttpStatus.CREATED);
    return result.response;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar el estado de un pago por ID (HU-09, RF-12)',
    description:
      'Obtiene el estado actual y detalles de un pago perteneciente al tenant de la API Key.',
  })
  @ApiParam({ name: 'id', description: 'UUID del pago' })
  @ApiHeader({
    name: 'X-Api-Key',
    description: 'API Key del comercio',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Pago encontrado exitosamente.',
    type: PaymentDetailsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pago no encontrado o perteneciente a otro tenant.',
    type: PaymentErrorResponseDto,
  })
  async getById(
    @CurrentApiKeyContext() apiKeyContext: ApiKeyContext,
    @Param('id') paymentId: string,
  ): Promise<PaymentDetailsResponseDto> {
    if (!isUUID(paymentId)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El ID del pago debe ser un UUID válido.',
      });
    }

    return this.getPaymentUseCase.execute(apiKeyContext.tenantId, paymentId);
  }
}
