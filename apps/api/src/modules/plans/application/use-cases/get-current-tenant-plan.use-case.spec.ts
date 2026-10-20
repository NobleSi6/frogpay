import { jest } from '@jest/globals';
import { Plan } from '../../domain/entities/plan.entity.js';
import { PlanRepository } from '../../domain/repositories/plan.repository.js';
import { Clock } from '../ports/clock.port.js';
import { GetCurrentTenantPlanUseCase } from './get-current-tenant-plan.use-case.js';
import { getCurrentPlanPeriod } from './plan-period.js';

describe('GetCurrentTenantPlanUseCase', () => {
  const plan: Plan = {
    id: 'plan-id',
    name: 'Free',
    monthlyPrice: '0.00',
    monthlyVolumeLimit: '5000.00',
    commissionFixed: '0.50',
    commissionPct: '0.0350',
    features: { webhooks: true },
  };
  const premiumPlan: Plan = {
    id: 'premium-id',
    name: 'Premium',
    monthlyPrice: '150.00',
    monthlyVolumeLimit: null,
    commissionFixed: '0.30',
    commissionPct: '0.0250',
    features: { analytics: true },
  };
  const fixedDate = new Date('2026-03-01T02:30:00.000Z');

  function createUseCase(
    data: {
      plan: Plan | null;
      volumeUsed: string;
      txCount: number;
      planExpiresAt?: string | null;
    } | null,
    extras: {
      downgradeTenantToFree?: ReturnType<typeof jest.fn>;
    } = {},
  ) {
    const findTenantPlan = jest.fn(async () => data);
    const repository = {
      findTenantPlan,
      downgradeTenantToFree:
        extras.downgradeTenantToFree ?? jest.fn(async () => false),
    } as unknown as PlanRepository;
    const clock: Clock = { now: () => fixedDate };
    return {
      useCase: new GetCurrentTenantPlanUseCase(repository, clock),
      repository,
      findTenantPlan,
    };
  }

  it('returns zero usage and the full limit when there is no usage row', async () => {
    const { useCase } = createUseCase({
      plan,
      volumeUsed: '0.00',
      txCount: 0,
      planExpiresAt: null,
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      period: '2026-02',
      volumeUsed: '0.00',
      txCount: 0,
      remaining: '5000.00',
      limitReached: false,
      planExpiresAt: null,
    });
  });

  it('subtracts partial usage using decimal precision', async () => {
    const { useCase } = createUseCase({
      plan,
      volumeUsed: '1234.56',
      txCount: 12,
      planExpiresAt: null,
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      volumeUsed: '1234.56',
      txCount: 12,
      remaining: '3765.44',
      limitReached: false,
    });
  });

  it('reports unlimited plans with null remaining and no reached limit', async () => {
    const { useCase } = createUseCase({
      plan: premiumPlan,
      volumeUsed: '999999999999.99',
      txCount: 999,
      planExpiresAt: '2026-04-01T02:30:00.000Z',
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      remaining: null,
      limitReached: false,
      planExpiresAt: '2026-04-01T02:30:00.000Z',
    });
  });

  it('clamps remaining to zero and marks limit reached at or above the limit', async () => {
    const { useCase } = createUseCase({
      plan,
      volumeUsed: '5000.01',
      txCount: 50,
      planExpiresAt: null,
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      remaining: '0.00',
      limitReached: true,
    });
  });

  it('calculates the period from the injected clock in America/La_Paz', async () => {
    const { useCase, findTenantPlan } = createUseCase({
      plan,
      volumeUsed: '0.00',
      txCount: 0,
      planExpiresAt: null,
    });

    expect(getCurrentPlanPeriod(fixedDate)).toBe('2026-02');
    await useCase.execute('tenant-id');
    expect(findTenantPlan).toHaveBeenCalledWith('tenant-id', '2026-02');
  });

  it('downgrades an expired Premium plan to Free and returns the Free status', async () => {
    const expiredPremium = {
      plan: premiumPlan,
      volumeUsed: '100.00',
      txCount: 2,
      planExpiresAt: '2026-02-01T00:00:00.000Z',
    };
    const freeAfterDowngrade = {
      plan,
      volumeUsed: '100.00',
      txCount: 2,
      planExpiresAt: null,
    };
    let findCalls = 0;
    const findTenantPlan = jest.fn(async () => {
      findCalls += 1;
      return findCalls === 1 ? expiredPremium : freeAfterDowngrade;
    });
    const downgradeTenantToFree = jest.fn(async () => true);
    const repository = {
      findTenantPlan,
      downgradeTenantToFree,
    } as unknown as PlanRepository;
    const clock: Clock = { now: () => fixedDate };
    const useCase = new GetCurrentTenantPlanUseCase(repository, clock);

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      plan,
      remaining: '4900.00',
      planExpiresAt: null,
    });
    expect(downgradeTenantToFree).toHaveBeenCalledWith('tenant-id');
    expect(findTenantPlan).toHaveBeenCalledTimes(2);
  });

  it('does not downgrade a Premium plan whose expiry is still in the future', async () => {
    const { useCase, repository } = createUseCase({
      plan: premiumPlan,
      volumeUsed: '0.00',
      txCount: 0,
      planExpiresAt: '2026-04-01T02:30:00.000Z',
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      plan: premiumPlan,
      remaining: null,
      planExpiresAt: '2026-04-01T02:30:00.000Z',
    });
    expect(repository.downgradeTenantToFree).not.toHaveBeenCalled();
  });
});
