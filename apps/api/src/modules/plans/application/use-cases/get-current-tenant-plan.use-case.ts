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
    let data = await this.plans.findTenantPlan(tenantId, period);

    if (!data?.plan) {
      throw new NotFoundException('El tenant no tiene un plan asignado.');
    }

    if (this.isExpiredPremium(data.plan.name, data.planExpiresAt)) {
      const downgraded = await this.plans.downgradeTenantToFree(tenantId);
      if (downgraded) {
        data = await this.plans.findTenantPlan(tenantId, period);
        if (!data?.plan) {
          throw new NotFoundException('El tenant no tiene un plan asignado.');
        }
      }
    }

    return this.toStatus(
      data.plan,
      period,
      data.volumeUsed,
      data.txCount,
      data.planExpiresAt,
    );
  }

  toStatus(
    plan: TenantPlanStatus['plan'],
    period: string,
    volumeUsedValue: string,
    txCount: number,
    planExpiresAt: string | null = null,
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
      planExpiresAt,
    };
  }

  private isExpiredPremium(planName: string, planExpiresAt: string | null): boolean {
    if (!planExpiresAt) return false;
    if (!planName.toLowerCase().includes('premium')) return false;
    return new Date(planExpiresAt).getTime() <= this.clock.now().getTime();
  }
}
