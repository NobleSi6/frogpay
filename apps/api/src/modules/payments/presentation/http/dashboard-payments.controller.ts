import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import { BankReconciliationService } from '../../application/services/bank-reconciliation.service';
import { CreatePaymentDto } from '../../application/dto/create-payment.dto';
import { PaymentResponseDto } from '../../application/dto/payment-response.dto';
import { PaymentDetailsResponseDto } from '../../application/dto/payment-details.dto';
import { PaymentErrorResponseDto } from '../../application/dto/payment-error.dto';
import {
  DashboardSimulateDepositDto,
  BankDepositSimulationResponseDto,
} from '../../application/dto/bank-deposit-simulation.dto';

@ApiTags('Dashboard BFF - Pagos (TSK-DEV3-203)')
@ApiBearerAuth()
@Controller('dashboard/payments')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
export class DashboardPaymentsController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
    private readonly bankReconciliationService: BankReconciliationService,
  ) {}

  @Post('test')
  @ApiOperation({
    summary: 'Crear un pago de prueba en sandbox desde el Dashboard (TSK-DEV3-203)',
    description:
      'Autenticado con la sesión JWT del Owner/Admin. Fuerza el ambiente sandbox y reutiliza el caso de uso común de creación de pago.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'UUID generado por el frontend por cada intento de pago',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Pago de prueba procesado.',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Reintento idempotente exitoso.',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validación de campos fallida.',
    type: PaymentErrorResponseDto,
  })
  async createTestPayment(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentResponseDto> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El encabezado Idempotency-Key es obligatorio y debe ser un UUID válido.',
      });
    }

    // El endpoint del Dashboard SIEMPRE fuerza el ambiente a 'sandbox'
    const result = await this.createPaymentUseCase.execute(
      context.tenantId,
      'sandbox',
      idempotencyKey,
      dto,
    );

    res.status(result.isReplay ? HttpStatus.OK : HttpStatus.CREATED);
    return result.response;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar el detalle completo e historial de un pago (RF-10, TSK-DEV3-203)',
    description:
      'Devuelve el detalle del pago junto con su línea de tiempo e historial de estados para las pantallas del Dashboard.',
  })
  @ApiParam({ name: 'id', description: 'UUID del pago' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del pago recuperado exitosamente.',
    type: PaymentDetailsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pago no encontrado o de otro tenant.',
    type: PaymentErrorResponseDto,
  })
  async getDetails(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('id') paymentId: string,
  ): Promise<PaymentDetailsResponseDto> {
    if (!isUUID(paymentId)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El ID del pago debe ser un UUID válido.',
      });
    }

    return this.getPaymentUseCase.execute(context.tenantId, paymentId);
  }

  @Post(':id/simulate-deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simular depósito bancario para un pago desde el Dashboard (TSK-BANK-303)',
    description:
      'Autenticado con JWT de Owner/Admin en ambiente sandbox. Permite probar flujos de conciliación directa desde la interfaz.',
  })
  @ApiParam({ name: 'id', description: 'UUID del pago' })
  @ApiResponse({
    status: 200,
    description: 'Simulación ejecutada.',
    type: BankDepositSimulationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'El pago no es de ambiente sandbox.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pago no encontrado.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Transición de estado inválida.',
    type: PaymentErrorResponseDto,
  })
  async simulateDeposit(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('id') paymentId: string,
    @Body() dto: DashboardSimulateDepositDto,
  ): Promise<BankDepositSimulationResponseDto> {
    if (!isUUID(paymentId)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El ID del pago debe ser un UUID válido.',
      });
    }

    const payment = await this.getPaymentUseCase.execute(context.tenantId, paymentId);

    if (payment.environment !== 'sandbox') {
      throw new ForbiddenException({
        code: 'forbidden_in_production',
        message: 'La simulación solo está disponible en ambiente sandbox.',
      });
    }

    let reference = payment.providerTransactionId ?? `BT-REF-${Date.now()}`;
    let amount = payment.amount;

    if (dto.mode === 'amount_mismatch') {
      amount = (parseFloat(payment.amount) + 10).toFixed(2);
    } else if (dto.mode === 'reference_not_found') {
      reference = `BT-UNKNOWN-${Date.now()}`;
    }

    const result = await this.bankReconciliationService.reconcile({
      tenantId: context.tenantId,
      depositId: `DASH-SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      reference,
      amount,
      currency: payment.currency,
      bankName: 'Banco FrogPay Simulado Dashboard',
    });

    return {
      status: result.status,
      depositId: result.depositId,
      paymentId: result.paymentId,
      errorCode: result.errorCode,
    };
  }
}
