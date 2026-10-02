import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Plan } from '../../domain/entities/plan.entity.js';
import { PlanRepository } from '../../domain/repositories/plan.repository.js';
import { Clock } from '../ports/clock.port.js';
import { ChangeTenantPlanUseCase } from './change-tenant-plan.use-case.js';
import { GetCurrentTenantPlanUseCase } from './get-current-tenant-plan.use-case.js';

describe('ChangeTenantPlanUseCase', () => {
  const plan: Plan = {
    id: 'new-plan',
    name: 'Premium',
    monthlyPrice: '150.00',
    monthlyVolumeLimit: null,
    commissionFixed: '0.30',
    commissionPct: '0.0250',
    features: { analytics: true },
  };
  const clock: Clock = { now: () => new Date('2026-04-15T12:00:00.000Z') };

  function createUseCase(changeResult?: unknown) {
    const changeTenantPlan = jest.fn(async () => changeResult ?? {
      kind: 'tenant-plan' as const,
      data: { plan, volumeUsed: '25.50', txCount: 3 },
    });
    const repository = { changeTenantPlan } as unknown as PlanRepository;
    const getCurrentPlan = new GetCurrentTenantPlanUseCase(repository, clock);
    return {
      useCase: new ChangeTenantPlanUseCase(repository, clock, getCurrentPlan),
      changeTenantPlan,
    };
  }

  it('rejects non-owners without calling the repository', async () => {
    const { useCase, changeTenantPlan } = createUseCase();

    await expect(
      useCase.execute('tenant-id', 'tenant_developer', 'new-plan'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(changeTenantPlan).not.toHaveBeenCalled();
  });

  it('returns NotFound when the requested plan does not exist', async () => {
    const { useCase } = createUseCase({ kind: 'plan-not-found' });

    await expect(
      useCase.execute('tenant-id', 'tenant_owner', 'missing-plan'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assigns the requested plan using tenant and La Paz period from context/clock', async () => {
    const { useCase, changeTenantPlan } = createUseCase();

    await expect(
      useCase.execute('tenant-id', 'tenant_owner', 'new-plan'),
    ).resolves.toMatchObject({
      plan,
      period: '2026-04',
      volumeUsed: '25.50',
      txCount: 3,
      remaining: null,
      limitReached: false,
    });
    expect(changeTenantPlan).toHaveBeenCalledWith(
      'tenant-id',
      'new-plan',
      '2026-04',
    );
  });
});