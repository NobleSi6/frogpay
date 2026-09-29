import { Module } from '@nestjs/common';
import { CLOCK } from './application/ports/clock.port.js';
import { PLAN_REPOSITORY } from './domain/repositories/plan.repository.js';
import { SystemClock } from './infrastructure/clock.service.js';
import { PrismaPlanRepository } from './infrastructure/persistence/prisma-plan.repository.js';
import { ChangeTenantPlanUseCase } from './application/use-cases/change-tenant-plan.use-case.js';
import { GetCurrentTenantPlanUseCase } from './application/use-cases/get-current-tenant-plan.use-case.js';
import { GetPlanCatalogUseCase } from './application/use-cases/get-plan-catalog.use-case.js';
import { PlansController } from './presentation/http/plans.controller.js';
import { TenantPlanController } from './presentation/http/tenant-plan.controller.js';
import { ForceHeaderTenantContextGuard } from '../../shared/auth/current-tenant.decorator.js';

@Module({
  controllers: [PlansController, TenantPlanController],
  providers: [
    GetPlanCatalogUseCase,
    GetCurrentTenantPlanUseCase,
    ChangeTenantPlanUseCase,
    PrismaPlanRepository,
    { provide: PLAN_REPOSITORY, useExisting: PrismaPlanRepository },
    { provide: CLOCK, useClass: SystemClock },
    ForceHeaderTenantContextGuard,
  ],
})
export class PlansModule {}