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
  const fixedDate = new Date('2026-03-01T02:30:00.000Z');

  function createUseCase(data: {
    plan: Plan | null;
    volumeUsed: string;
    txCount: number;
  } | null) {
    const repository = {
      findTenantPlan: jest.fn(async () => data),
    } as unknown as PlanRepository;
    const clock: Clock = { now: () => fixedDate };
    return {
      useCase: new GetCurrentTenantPlanUseCase(repository, clock),
      repository,
    };
  }

  it('returns zero usage and the full limit when there is no usage row', async () => {
    const { useCase } = createUseCase({ plan, volumeUsed: '0.00', txCount: 0 });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      period: '2026-02',
      volumeUsed: '0.00',
      txCount: 0,
      remaining: '5000.00',
      limitReached: false,
    });
  });

  it('subtracts partial usage using decimal precision', async () => {
    const { useCase } = createUseCase({
      plan,
      volumeUsed: '1234.56',
      txCount: 12,
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      volumeUsed: '1234.56',
      txCount: 12,
      remaining: '3765.44',
      limitReached: false,
    });
  });

  it('reports unlimited plans with null remaining and no reached limit', async () => {
    const unlimitedPlan = { ...plan, monthlyVolumeLimit: null };
    const { useCase } = createUseCase({
      plan: unlimitedPlan,
      volumeUsed: '999999999999.99',
      txCount: 999,
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      remaining: null,
      limitReached: false,
    });
  });

  it('clamps remaining to zero and marks limit reached at or above the limit', async () => {
    const { useCase } = createUseCase({
      plan,
      volumeUsed: '5000.01',
      txCount: 50,
    });

    await expect(useCase.execute('tenant-id')).resolves.toMatchObject({
      remaining: '0.00',
      limitReached: true,
    });
  });

  it('calculates the period from the injected clock in America/La_Paz', async () => {
    const { useCase, repository } = createUseCase({
      plan,
      volumeUsed: '0.00',
      txCount: 0,
    });

    expect(getCurrentPlanPeriod(fixedDate)).toBe('2026-02');
    await useCase.execute('tenant-id');
    expect(repository.findTenantPlan).toHaveBeenCalledWith('tenant-id', '2026-02');
  });
});