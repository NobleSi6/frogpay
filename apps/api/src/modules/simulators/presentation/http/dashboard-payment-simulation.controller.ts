import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { PaymentSimulationResponseDto } from '../../application/dto/payment-simulation-response.dto';
import { SimulateQrPaymentDto } from '../../application/dto/simulate-qr-payment.dto';
import { PaymentSimulationService } from '../../application/payment-simulation.service';

@ApiTags('Dashboard BFF - Simulador QR')
@ApiBearerAuth()
@Controller('dashboard/payments')
export class DashboardPaymentSimulationController {
  constructor(private readonly paymentSimulation: PaymentSimulationService) {}

  @Post(':id/simulate')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Simular el resultado de un pago QR sandbox',
    description: 'Solo disponible para el Owner del tenant y para pagos QR sandbox.',
  })
  @ApiParam({ name: 'id', description: 'UUID del pago QR' })
  @ApiResponse({ status: 200, description: 'Resultado de la simulación.', type: PaymentSimulationResponseDto })
  @ApiResponse({ status: 400, description: 'ID o resultado inválido.' })
  @ApiResponse({ status: 403, description: 'Rol o ambiente no permitido.' })
  @ApiResponse({ status: 404, description: 'Pago no encontrado para el tenant.' })
  async simulate(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('id') paymentId: string,
    @Body() dto: SimulateQrPaymentDto,
  ): Promise<PaymentSimulationResponseDto> {
    if (!isUUID(paymentId)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'El ID del pago debe ser un UUID válido.',
      });
    }

    return this.paymentSimulation.simulate(context.tenantId, paymentId, dto.result);
  }
}
