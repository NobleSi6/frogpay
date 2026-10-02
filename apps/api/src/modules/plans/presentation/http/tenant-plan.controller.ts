import {
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator.js';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator.js';
import { ChangeTenantPlanUseCase } from '../../application/use-cases/change-tenant-plan.use-case.js';
import { GetCurrentTenantPlanUseCase } from '../../application/use-cases/get-current-tenant-plan.use-case.js';
import { ChangeTenantPlanDto } from '../dto/change-tenant-plan.dto.js';

@Controller('tenants/me/plan')
export class TenantPlanController {
  constructor(
    private readonly getCurrentPlan: GetCurrentTenantPlanUseCase,
    private readonly changeTenantPlan: ChangeTenantPlanUseCase,
  ) {}

  @Get()
  getPlan(@CurrentTenantContext() context: AuthenticatedTenantContext) {
    return this.getCurrentPlan.execute(context.tenantId);
  }

  @Put()
  putPlan(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Body() body: ChangeTenantPlanDto,
  ) {
    return this.changeTenantPlan.execute(
      context.tenantId,
      context.role,
      body.planId,
    );
  }
}