import { Plan } from './plan.entity.js';

export interface TenantPlanStatus {
  plan: Plan;
  period: string;
  volumeUsed: string;
  txCount: number;
  remaining: string | null;
  limitReached: boolean;
}