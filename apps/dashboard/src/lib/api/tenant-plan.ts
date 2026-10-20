import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api-client";

export interface TenantPlanInfo {
  id: string;
  name: string;
  monthlyPrice: string;
  /** null = sin límite mensual de volumen. */
  monthlyVolumeLimit: string | null;
  commissionFixed: string;
  commissionPct: string;
  features: unknown;
}

export interface TenantPlanStatus {
  plan: TenantPlanInfo;
  period: string;
  volumeUsed: string;
  txCount: number;
  remaining: string | null;
  limitReached: boolean;
}

export const TENANT_PLAN_ENDPOINT = "/tenants/me/plan";

/** Consulta independiente de la tarjeta de plan del home (Sprint 1). */
export async function getTenantPlan(signal?: AbortSignal): Promise<TenantPlanStatus> {
  return apiRequest<TenantPlanStatus>(TENANT_PLAN_ENDPOINT, { signal });
}

export function useTenantPlan(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["tenant", "plan"],
    queryFn: ({ signal }) => getTenantPlan(signal),
    enabled: options.enabled ?? true,
    retry: (failureCount, error) =>
      error instanceof ApiError ? error.status !== 404 && failureCount < 2 : failureCount < 2,
  });
}

/**
 * Porcentaje (0-100) de volumen mensual usado, calculado sobre las cadenas
 * decimales del backend. Devuelve null cuando el plan no tiene límite.
 */
export function planUsagePercent(status: TenantPlanStatus | null | undefined): number | null {
  if (!status) return null;
  const limit = status.plan.monthlyVolumeLimit;
  if (limit === null || limit.trim() === "") return null;
  const limitValue = Number(limit);
  const usedValue = Number(status.volumeUsed);
  if (!Number.isFinite(limitValue) || !Number.isFinite(usedValue) || limitValue <= 0) return null;
  return Math.min(Math.max((usedValue / limitValue) * 100, 0), 100);
}
