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

/** Duración del ciclo Premium simulado: 1 mes desde el cambio. */
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const OWNER_ROLES = new Set(['OWNER', 'tenant_owner']);

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
    if (!OWNER_ROLES.has(role)) {
      throw new ForbiddenException('Solo el propietario del tenant puede cambiar el plan.');
    }

    const now = this.clock.now();
    const period = getCurrentPlanPeriod(now);
    const catalog = await this.plans.findCatalog();
    const targetPlan = catalog.find((candidate) => candidate.id === planId);
    if (!targetPlan) {
      throw new NotFoundException('El plan solicitado no existe.');
    }

    // Simulación de cobro: Premium otorga 1 mes de vigencia; Free no expira.
    const planExpiresAt = targetPlan.name.toLowerCase().includes('premium')
      ? new Date(now.getTime() + PREMIUM_DURATION_MS)
      : null;

    const result = await this.plans.changeTenantPlan(
      tenantId,
      planId,
      period,
      planExpiresAt,
    );

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
      result.data.planExpiresAt,
    );
  }
}
