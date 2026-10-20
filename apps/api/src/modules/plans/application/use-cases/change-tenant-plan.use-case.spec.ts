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

  function createUseCase(changeResult?: unknown, catalog: Plan[] = [plan]) {
    const changeTenantPlan = jest.fn(async () => changeResult ?? {
      kind: 'tenant-plan' as const,
      data: {
        plan,
        volumeUsed: '25.50',
        txCount: 3,
        planExpiresAt: new Date('2026-05-15T12:00:00.000Z').toISOString(),
      },
    });
    const findCatalog = jest.fn(async () => catalog);
    const repository = { changeTenantPlan, findCatalog } as unknown as PlanRepository;
    const getCurrentPlan = new GetCurrentTenantPlanUseCase(repository, clock);
    return {
      useCase: new ChangeTenantPlanUseCase(repository, clock, getCurrentPlan),
      changeTenantPlan,
      findCatalog,
    };
  }

  it('rejects non-owners without calling the repository', async () => {
    const { useCase, changeTenantPlan } = createUseCase();

    await expect(
      useCase.execute('tenant-id', 'tenant_developer', 'new-plan'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(changeTenantPlan).not.toHaveBeenCalled();
  });

  it('accepts the OWNER role from the real JWT', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.execute('tenant-id', 'OWNER', 'new-plan'),
    ).resolves.toMatchObject({ plan });
  });

  it('accepts the legacy tenant_owner debug role', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.execute('tenant-id', 'tenant_owner', 'new-plan'),
    ).resolves.toMatchObject({ plan });
  });

  it('returns NotFound when the requested plan does not exist', async () => {
    const { useCase, changeTenantPlan } = createUseCase(undefined, []);

    await expect(
      useCase.execute('tenant-id', 'OWNER', 'missing-plan'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(changeTenantPlan).not.toHaveBeenCalled();
  });

  it('assigns the requested plan using tenant and La Paz period from context/clock', async () => {
    const { useCase, changeTenantPlan } = createUseCase();

    await expect(
      useCase.execute('tenant-id', 'OWNER', 'new-plan'),
    ).resolves.toMatchObject({
      plan,
      period: '2026-04',
      volumeUsed: '25.50',
      txCount: 3,
      remaining: null,
      limitReached: false,
      planExpiresAt: '2026-05-15T12:00:00.000Z',
    });
    expect(changeTenantPlan).toHaveBeenCalledWith(
      'tenant-id',
      'new-plan',
      '2026-04',
      new Date('2026-05-15T12:00:00.000Z'),
    );
  });

  it('sets a one-month expiry when switching to Premium', async () => {
    const { useCase, changeTenantPlan } = createUseCase();

    await useCase.execute('tenant-id', 'OWNER', 'new-plan');

    expect(changeTenantPlan).toHaveBeenCalledWith(
      'tenant-id',
      'new-plan',
      '2026-04',
      new Date('2026-05-15T12:00:00.000Z'),
    );
  });

  it('clears expiry when switching back to Free', async () => {
    const freePlan: Plan = {
      id: 'free-plan',
      name: 'Free',
      monthlyPrice: '0.00',
      monthlyVolumeLimit: '5000.00',
      commissionFixed: '0.50',
      commissionPct: '0.0350',
      features: {},
    };
    const { useCase, changeTenantPlan } = createUseCase(
      {
        kind: 'tenant-plan' as const,
        data: { plan: freePlan, volumeUsed: '0.00', txCount: 0, planExpiresAt: null },
      },
      [freePlan],
    );

    const result = await useCase.execute('tenant-id', 'OWNER', 'free-plan');

    expect(changeTenantPlan).toHaveBeenCalledWith(
      'tenant-id',
      'free-plan',
      '2026-04',
      null,
    );
    expect(result.planExpiresAt).toBeNull();
  });
});
