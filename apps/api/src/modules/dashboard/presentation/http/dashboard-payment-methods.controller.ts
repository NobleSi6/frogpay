import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentProviderRegistry } from '../../../provider-adapters/registry/payment-provider.registry';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { DashboardPaymentMethodDto } from './dashboard-payment-method.dto';

@ApiTags('Dashboard BFF - Métodos de pago')
@ApiBearerAuth()
@Controller('dashboard/payment-methods')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
export class DashboardPaymentMethodsController {
  constructor(private readonly paymentProviders: PaymentProviderRegistry) {}

  @Get()
  @ApiOperation({
    summary: 'Listar métodos de pago habilitados para el Dashboard',
    description: 'Devuelve los métodos resueltos por configuración, sin exponer identificadores internos de adapters.',
  })
  @ApiResponse({
    status: 200,
    description: 'Métodos de pago habilitados.',
    type: DashboardPaymentMethodDto,
    isArray: true,
  })
  getPaymentMethods(): DashboardPaymentMethodDto[] {
    return this.paymentProviders.listMethods().map(
      ({ code, label, processingMode, requiresPaymentToken }) => ({
        code,
        label,
        processingMode,
        requiresPaymentToken,
      }),
    );
  }
}
