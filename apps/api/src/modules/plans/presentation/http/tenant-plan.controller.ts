import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentTenant,
  ForceHeaderTenantContextGuard,
} from '../../../../shared/auth/current-tenant.decorator.js';
import type { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator.js';
import { ChangeTenantPlanUseCase } from '../../application/use-cases/change-tenant-plan.use-case.js';
import { GetCurrentTenantPlanUseCase } from '../../application/use-cases/get-current-tenant-plan.use-case.js';
import { ChangeTenantPlanDto } from '../dto/change-tenant-plan.dto.js';

@Controller('tenants/me/plan')
@UseGuards(ForceHeaderTenantContextGuard)
export class TenantPlanController {
  constructor(
    private readonly getCurrentPlan: GetCurrentTenantPlanUseCase,
    private readonly changeTenantPlan: ChangeTenantPlanUseCase,
  ) {}

  // Reemplazar ForceHeaderTenantContextGuard por el guard real de Jean (lee tenant_id y role del JWT) en cuanto esté disponible — el contrato de CurrentTenantContext no cambia.
  @Get()
  getPlan(@CurrentTenant() context: CurrentTenantContext) {
    return this.getCurrentPlan.execute(context.tenantId);
  }

  @Put()
  putPlan(
    @CurrentTenant() context: CurrentTenantContext,
    @Body() body: ChangeTenantPlanDto,
  ) {
    return this.changeTenantPlan.execute(
      context.tenantId,
      context.role,
      body.planId,
    );
  }
}