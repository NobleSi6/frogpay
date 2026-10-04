import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { StripeCredentialsService } from '../../application/stripe-credentials.service';
import { StripeCredentialsDto } from '../dto/stripe-credentials.dto';

@ApiTags('Credenciales de proveedores')
@ApiBearerAuth()
@Controller('tenants/me/providers/stripe/credentials')
@Roles('OWNER')
export class StripeCredentialsController {
  constructor(private readonly credentials: StripeCredentialsService) {}

  @Get(':environment')
  getCredentials(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('environment') environment: string,
  ) {
    return this.credentials.get(context.tenantId, context.role, environment);
  }

  @Put(':environment')
  saveCredentials(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Param('environment') environment: string,
    @Body() body: StripeCredentialsDto,
  ) {
    return this.credentials.save(context.tenantId, context.role, environment, body);
  }
}