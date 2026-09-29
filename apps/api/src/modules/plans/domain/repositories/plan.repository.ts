import { Plan } from '../entities/plan.entity.js';

export interface TenantPlanData {
  plan: Plan | null;
  volumeUsed: string;
  txCount: number;
}

export type ChangeTenantPlanResult =
  | { kind: 'plan-not-found' }
  | { kind: 'tenant-not-found' }
  | { kind: 'tenant-plan'; data: TenantPlanData };

export interface PlanRepository {
  findCatalog(): Promise<Plan[]>;
  findTenantPlan(tenantId: string, period: string): Promise<TenantPlanData | null>;
  changeTenantPlan(
    tenantId: string,
    planId: string,
    period: string,
  ): Promise<ChangeTenantPlanResult>;
}

export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');