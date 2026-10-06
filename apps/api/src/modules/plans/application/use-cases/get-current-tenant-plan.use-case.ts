import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantPlanStatus } from '../../domain/entities/tenant-plan-status.entity.js';
import { PLAN_REPOSITORY } from '../../domain/repositories/plan.repository.js';
import type { PlanRepository } from '../../domain/repositories/plan.repository.js';
import { CLOCK } from '../ports/clock.port.js';
import type { Clock } from '../ports/clock.port.js';
import { getCurrentPlanPeriod } from './plan-period.js';

@Injectable()
export class GetCurrentTenantPlanUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(tenantId: string): Promise<TenantPlanStatus> {
    const period = getCurrentPlanPeriod(this.clock.now());
    const data = await this.plans.findTenantPlan(tenantId, period);

    if (!data?.plan) {
      throw new NotFoundException('El tenant no tiene un plan asignado.');
    }

    return this.toStatus(data.plan, period, data.volumeUsed, data.txCount);
  }

  toStatus(
    plan: TenantPlanStatus['plan'],
    period: string,
    volumeUsedValue: string,
    txCount: number,
  ): TenantPlanStatus {
    const volumeUsed = new Prisma.Decimal(volumeUsedValue);
    const monthlyLimit = plan.monthlyVolumeLimit === null
      ? null
      : new Prisma.Decimal(plan.monthlyVolumeLimit);
    const remaining = monthlyLimit === null
      ? null
      : Prisma.Decimal.max(monthlyLimit.minus(volumeUsed), new Prisma.Decimal(0));

    return {
      plan,
      period,
      volumeUsed: volumeUsed.toFixed(2),
      txCount,
      remaining: remaining?.toFixed(2) ?? null,
      limitReached: monthlyLimit !== null && volumeUsed.greaterThanOrEqualTo(monthlyLimit),
    };
  }
}