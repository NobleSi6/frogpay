import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../shared/auth/public.decorator';
import { CurrentApiKeyContext } from '../../../payments/presentation/decorators/api-key-context.decorator';
import { ApiKeyAuthGuard } from '../../../payments/presentation/guards/api-key-auth.guard';
import type { ApiKeyContext } from '../../../payments/presentation/guards/api-key-auth.guard';
import { PaymentSimulationResponseDto } from '../../application/dto/payment-simulation-response.dto';
import { QrCallbackDto } from '../../application/dto/qr-callback.dto';
import { PaymentSimulationService } from '../../application/payment-simulation.service';

@ApiTags('Simulador QR (sandbox)')
@Controller('v1/test/simulators')
@Public()
@UseGuards(ApiKeyAuthGuard)
export class QrCallbackController {
  constructor(private readonly paymentSimulation: PaymentSimulationService) {}

  @Post('qr-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simular el callback del proveedor QR',
    description:
      'Solo para API keys sandbox. El tenant se toma de la API key; payment_id usa snake_case.',
  })
  @ApiHeader({ name: 'X-Api-Key', required: true, description: 'API key sandbox del comercio.' })
  @ApiResponse({ status: 200, description: 'Pago simulado.', type: PaymentSimulationResponseDto })
  @ApiResponse({ status: 401, description: 'API key ausente o inválida.' })
  @ApiResponse({ status: 403, description: 'Simulación deshabilitada o ambiente production.' })
  @ApiResponse({ status: 404, description: 'Pago no encontrado para el tenant de la API key.' })
  async simulateCallback(
    @CurrentApiKeyContext() apiKey: ApiKeyContext,
    @Body() dto: QrCallbackDto,
  ): Promise<PaymentSimulationResponseDto> {
    return this.paymentSimulation.simulate(
      apiKey.tenantId,
      dto.payment_id,
      dto.result,
      apiKey.environment,
    );
  }
}
