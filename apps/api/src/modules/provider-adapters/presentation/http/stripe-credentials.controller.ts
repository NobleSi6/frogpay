import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { StripeCredentialsService } from '../../application/stripe-credentials.service';
import { StripeCredentialsDto, StripeCredentialsResponseDto } from '../dto/stripe-credentials.dto';

@ApiTags('Credenciales de proveedores')
@ApiBearerAuth()
@Controller('tenants/me/providers/stripe/credentials')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class StripeCredentialsController {
  constructor(private readonly credentials: StripeCredentialsService) {}

  @Get(':environment')
  @ApiOperation({ summary: 'Consultar credenciales de Stripe del tenant actual' })
  @ApiParam({ name: 'environment', enum: ['sandbox', 'production'], description: 'Ambiente de ejecución' })
  @ApiResponse({ status: 200, description: 'Credenciales consultadas exitosamente', type: StripeCredentialsResponseDto })
  @ApiResponse({ status: 400, description: 'Ambiente inválido' })
  @ApiResponse({ status: 403, description: 'Solo el OWNER puede consultar credenciales' })
  getCredentials(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('environment') environment: string,
  ) {
    return this.credentials.get(context.tenantId, context.role, environment);
  }

  @Put(':environment')
  @ApiOperation({ summary: 'Guardar o actualizar credenciales de Stripe para el tenant actual' })
  @ApiParam({ name: 'environment', enum: ['sandbox', 'production'], description: 'Ambiente de ejecución' })
  @ApiResponse({ status: 200, description: 'Credenciales guardadas y cifradas exitosamente', type: StripeCredentialsResponseDto })
  @ApiResponse({ status: 400, description: 'Prefijo de claves inválido o ambiente inválido' })
  @ApiResponse({ status: 403, description: 'Solo el OWNER puede guardar credenciales' })
  saveCredentials(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('environment') environment: string,
    @Body() body: StripeCredentialsDto,
  ) {
    return this.credentials.save(context.tenantId, context.role, environment, body);
  }
}