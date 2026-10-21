import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import type { TenantPlanInfo, TenantPlanStatus } from "@/lib/api/tenant-plan";

export const PLAN_CATALOG_ENDPOINT = "/plans";

export type PlanCatalogItem = TenantPlanInfo;

export async function getPlanCatalog(signal?: AbortSignal): Promise<PlanCatalogItem[]> {
  return apiRequest<PlanCatalogItem[]>(PLAN_CATALOG_ENDPOINT, { signal });
}

export function usePlanCatalog(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["plans", "catalog"],
    queryFn: ({ signal }) => getPlanCatalog(signal),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

export async function changeTenantPlan(planId: string): Promise<TenantPlanStatus> {
  return apiRequest<TenantPlanStatus>("/tenants/me/plan", {
    method: "PUT",
    body: JSON.stringify({ planId }),
  });
}

export function useChangeTenantPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => changeTenantPlan(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant", "plan"] });
    },
  });
}

export function isPremiumPlanName(name: string): boolean {
  return name.trim().toLowerCase().includes("premium");
}

/** Fecha local (es-BO) de vencimiento; null si no hay fecha. */
export function formatPlanExpiry(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/La_Paz",
  }).format(date);
}
