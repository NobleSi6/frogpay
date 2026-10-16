import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../shared/auth/public.decorator';
import { ValidationError } from '../../../../shared/http/errors/validation-error';
import { CurrentApiKeyContext } from '../../../payments/presentation/decorators/api-key-context.decorator';
import { ApiKeyAuthGuard } from '../../../payments/presentation/guards/api-key-auth.guard';
import type { ApiKeyContext } from '../../../payments/presentation/guards/api-key-auth.guard';
import { PaymentProviderRegistry } from '../../../provider-adapters/registry/payment-provider.registry';
import { ProviderFault, ProviderFaultInjector } from '../../../provider-adapters/resilience/provider-fault-injector';
import { InjectProviderFaultDto, ProviderFaultResponseDto } from '../../application/dto/provider-fault.dto';

/**
 * Simulación de caída de un proveedor (TSK-DEV2-305). Solo sandbox: en
 * producción o con una API key de producción responde 403.
 */
@ApiTags('Simulador de fallas de proveedor (sandbox)')
@ApiHeader({ name: 'X-Api-Key', required: true, description: 'API key sandbox del comercio.' })
@Controller('v1/test/simulators/provider-fault')
@Public()
@UseGuards(ApiKeyAuthGuard)
export class ProviderFaultController {
  constructor(
    private readonly faults: ProviderFaultInjector,
    @Inject(PaymentProviderRegistry) private readonly providers: Pick<PaymentProviderRegistry, 'supportedAdapterCodes'>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Simular la caída (error) o lentitud (latency) de un proveedor por unos segundos' })
  @ApiResponse({ status: 201, type: ProviderFaultResponseDto })
  @ApiResponse({ status: 403, description: 'Solo disponible en sandbox.' })
  inject(@CurrentApiKeyContext() apiKey: ApiKeyContext, @Body() dto: InjectProviderFaultDto): ProviderFaultResponseDto {
    this.assertSandbox(apiKey);
    const provider = dto.provider.trim().toLowerCase();
    if (!this.providers.supportedAdapterCodes().includes(provider)) {
      throw new ValidationError({
        provider: `Proveedor desconocido. Disponibles: ${this.providers.supportedAdapterCodes().join(', ')}.`,
      });
    }
    return toResponse(this.faults.inject({ ...dto, provider }));
  }

  @Get()
  @ApiOperation({ summary: 'Listar las fallas simuladas activas' })
  @ApiResponse({ status: 200, type: [ProviderFaultResponseDto] })
  list(@CurrentApiKeyContext() apiKey: ApiKeyContext): ProviderFaultResponseDto[] {
    this.assertSandbox(apiKey);
    return this.faults.list().map(toResponse);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar la falla simulada de un proveedor (o de todos si no se indica)' })
  @ApiQuery({ name: 'provider', required: false })
  clear(@CurrentApiKeyContext() apiKey: ApiKeyContext, @Query('provider') provider?: string): void {
    this.assertSandbox(apiKey);
    this.faults.clear(provider);
  }

  private assertSandbox(apiKey: ApiKeyContext): void {
    if (process.env.NODE_ENV === 'production' || apiKey.environment !== 'sandbox') {
      throw new ForbiddenException({
        code: 'simulation_not_allowed',
        message: 'La simulación de fallas solo está disponible en sandbox.',
      });
    }
  }
}

function toResponse(fault: ProviderFault): ProviderFaultResponseDto {
  return { provider: fault.provider, mode: fault.mode, latencyMs: fault.latencyMs, until: fault.until.toISOString() };
}
