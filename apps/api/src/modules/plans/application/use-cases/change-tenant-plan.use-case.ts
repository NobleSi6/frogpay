import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantPlanStatus } from '../../domain/entities/tenant-plan-status.entity.js';
import { PLAN_REPOSITORY } from '../../domain/repositories/plan.repository.js';
import type { PlanRepository } from '../../domain/repositories/plan.repository.js';
import { CLOCK } from '../ports/clock.port.js';
import type { Clock } from '../ports/clock.port.js';
import { getCurrentPlanPeriod } from './plan-period.js';
import { GetCurrentTenantPlanUseCase } from './get-current-tenant-plan.use-case.js';

@Injectable()
export class ChangeTenantPlanUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getCurrentPlan: GetCurrentTenantPlanUseCase,
  ) {}

  async execute(
    tenantId: string,
    role: string,
    planId: string,
  ): Promise<TenantPlanStatus> {
    if (role !== 'tenant_owner') {
      throw new ForbiddenException('Solo el propietario del tenant puede cambiar el plan.');
    }

    const period = getCurrentPlanPeriod(this.clock.now());
    const result = await this.plans.changeTenantPlan(tenantId, planId, period);

    if (result.kind === 'plan-not-found') {
      throw new NotFoundException('El plan solicitado no existe.');
    }
    if (result.kind === 'tenant-not-found' || !result.data.plan) {
      throw new NotFoundException('No se encontró el tenant o su plan asignado.');
    }

    // TODO: emitir tenant.plan_cambiado cuando el EventBus/outbox esté disponible; no escribir directamente en domain_event_outbox.
    return this.getCurrentPlan.toStatus(
      result.data.plan,
      period,
      result.data.volumeUsed,
      result.data.txCount,
    );
  }
}