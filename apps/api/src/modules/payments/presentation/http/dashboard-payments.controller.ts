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
  Query,
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
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import { ListPaymentsUseCase } from '../../application/use-cases/list-payments.use-case';
import { BankReconciliationService } from '../../application/services/bank-reconciliation.service';
import { CreatePaymentDto } from '../../application/dto/create-payment.dto';
import { PaymentResponseDto } from '../../application/dto/payment-response.dto';
import {
  ListPaymentsQueryDto,
  ListPaymentsResponseDto,
} from '../../application/dto/list-payments.dto';
import { DashboardPaymentDetailsResponseDto } from '../../application/dto/dashboard-payment-details.dto';
import { PaymentErrorResponseDto } from '../../application/dto/payment-error.dto';
import {
  DashboardSimulateDepositDto,
  BankDepositSimulationResponseDto,
} from '../../application/dto/bank-deposit-simulation.dto';

@ApiTags('Dashboard BFF - Pagos (TSK-DEV1-402 / TSK-DEV3-203)')
@ApiBearerAuth()
@Controller('dashboard/payments')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
export class DashboardPaymentsController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
    private readonly listPaymentsUseCase: ListPaymentsUseCase,
    private readonly bankReconciliationService: BankReconciliationService,
    private readonly tenantContext: PrismaTenantContextService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar transacciones del tenant con paginación y filtros (HU-07 / RF-10 - TSK-DEV1-402)',
    description:
      'Devuelve el listado paginado en servidor filtrando exclusivamente por el tenant de la sesión JWT. Soporta filtros por estado, fechas, método, ambiente y búsqueda por referencia o ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de pagos recuperado exitosamente.',
    type: ListPaymentsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de consulta inválidos.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Sesión no autorizada o token JWT ausente.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Rol insuficiente (requiere rol OWNER o ADMIN).',
    type: PaymentErrorResponseDto,
  })
  async listPayments(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<ListPaymentsResponseDto> {
    return this.listPaymentsUseCase.execute(context.tenantId, query);
  }

  @Post('test')
  @ApiOperation({
    summary:
      'Crear un pago de prueba en sandbox desde el Dashboard (TSK-DEV3-203)',
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
        message:
          'El encabezado Idempotency-Key es obligatorio y debe ser un UUID válido.',
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
    summary:
      'Consultar el detalle completo e historial de un pago y webhooks (RF-10, TSK-DEV1-402)',
    description:
      'Devuelve el detalle del pago junto con su línea de tiempo e historial de estados y las entregas de webhooks asociadas.',
  })
  @ApiParam({ name: 'id', description: 'UUID del pago' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del pago recuperado exitosamente.',
    type: DashboardPaymentDetailsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'El ID del pago debe ser un UUID válido.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Sesión no autorizada o token JWT ausente.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Rol insuficiente (requiere rol OWNER o ADMIN).',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pago no encontrado o de otro tenant.',
    type: PaymentErrorResponseDto,
  })
  async getDetails(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('id') paymentId: string,
  ): Promise<DashboardPaymentDetailsResponseDto> {
    if (!isUUID(paymentId)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El ID del pago debe ser un UUID válido.',
      });
    }

    const baseDetails = await this.getPaymentUseCase.execute(
      context.tenantId,
      paymentId,
    );

    const webhookDeliveries = await this.tenantContext.withTenant(
      context.tenantId,
      async (tx) => {
        const deliveries = await tx.webhook_delivery.findMany({
          where: {
            payment_id: paymentId,
            tenant_id: context.tenantId,
          },
          orderBy: { created_at: 'desc' },
        });

        return deliveries.map((d) => ({
          id: d.id,
          webhookId: d.webhook_id,
          status: d.status,
          attemptCount: d.attempt_count,
          lastAttemptAt: d.delivered_at
            ? d.delivered_at.toISOString()
            : d.attempt_count > 0
              ? d.updated_at.toISOString()
              : null,
          nextAttemptAt: d.next_retry_at ? d.next_retry_at.toISOString() : null,
          createdAt: d.created_at.toISOString(),
        }));
      },
    );

    return {
      ...baseDetails,
      statusHistory: baseDetails.statusHistory ?? [],
      webhookDeliveries,
    };
  }

  @Post(':id/simulate-deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Simular depósito bancario para un pago desde el Dashboard (TSK-BANK-303)',
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
  @ApiResponse({
    status: 409,
    description: 'El identificador del depósito ya se usó con datos diferentes.',
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

    const payment = await this.getPaymentUseCase.execute(
      context.tenantId,
      paymentId,
    );

    if (payment.environment !== 'sandbox') {
      throw new ForbiddenException({
        code: 'forbidden_in_production',
        message: 'La simulación solo está disponible en ambiente sandbox.',
      });
    }

    if (payment.paymentMethod !== 'bank_transfer') {
      throw new BadRequestException({
        code: 'validation_error',
        message:
          'La simulación de depósito solo admite pagos por transferencia bancaria.',
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
