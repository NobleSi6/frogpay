import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api-client";

export type DashboardEnvironment = "sandbox" | "production";
export type DashboardDays = 7 | 30;

export interface DashboardMetricsByMethod {
  paymentMethod: string;
  transactionCount: number;
  approvedCount: number;
  volume: string;
}

export interface DashboardMetricsDailyPoint {
  date: string;
  transactionCount: number;
  volume: string;
  approvedCount: number;
  rejectedCount: number;
  failedCount: number;
  pendingCount: number;
  approvalRate: number;
}

export interface DashboardMetrics {
  /** Día UTC inclusivo del inicio de la ventana. */
  from: string;
  /** Día UTC del cierre de la ventana (último día con datos parciales). */
  to: string;
  environment: DashboardEnvironment;
  currency: string;
  volume: string;
  transactionCount: number;
  approvalRate: number;
  commissionAmount: string;
  netAmount: string;
  byMethod: DashboardMetricsByMethod[];
  dailySeries: DashboardMetricsDailyPoint[];
  generatedAt: string;
}

export interface DashboardMetricsParams {
  days: DashboardDays;
  environment: DashboardEnvironment;
}

export const DASHBOARD_METRICS_ENDPOINT = "/dashboard/metrics";
/** Refresco automático del home: alineado con la caché de 5 minutos del backend (ADR-012). */
export const METRICS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const METRICS_DAY_OPTIONS: Array<{ value: DashboardDays; label: string }> = [
  { value: 7, label: "Últimos 7 días" },
  { value: 30, label: "Últimos 30 días" },
];

export const METRICS_ENVIRONMENT_OPTIONS: Array<{ value: DashboardEnvironment; label: string }> = [
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Producción" },
];

/**
 * Contrato GET /dashboard/metrics: solo `days` y `environment`.
 * El tenant se deriva del JWT del Owner; nunca se envía tenantId.
 */
export function buildDashboardMetricsQueryString(params: DashboardMetricsParams): string {
  const query = new URLSearchParams();
  query.set("days", String(params.days));
  query.set("environment", params.environment);
  return query.toString();
}

export async function getDashboardMetrics(
  params: DashboardMetricsParams,
  signal?: AbortSignal,
): Promise<DashboardMetrics> {
  const query = buildDashboardMetricsQueryString(params);
  return apiRequest<DashboardMetrics>(`${DASHBOARD_METRICS_ENDPOINT}?${query}`, { signal });
}

export function useDashboardMetrics(
  params: DashboardMetricsParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["dashboard", "metrics", params],
    queryFn: ({ signal }) => getDashboardMetrics(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: METRICS_REFRESH_INTERVAL_MS,
    enabled: options.enabled ?? true,
    retry: (failureCount, error) =>
      error instanceof ApiError
        ? (error.status === 0 || error.status === 429) && failureCount < 1
        : failureCount < 2,
  });
}

/**
 * Tasa de aprobación (0 a 1) → porcentaje con un decimal en español.
 * 0.9286 → "92,9 %"; 0 → "0,0 %".
 */
export function formatApprovalRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const clamped = Math.min(Math.max(rate, 0), 1);
  return `${(clamped * 100).toFixed(1).replace(".", ",")} %`;
}

/** Volumen de uso del plan (0 a 1) → porcentaje con un decimal en español. */
export function formatUsagePercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "—";
  return `${percent.toFixed(1).replace(".", ",")} %`;
}

/** `generatedAt` → texto relativo en español ("hace 3 min"). */
export function formatRelativeUpdate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "—";
  const elapsedMs = Math.max(now.getTime() - timestamp, 0);
  if (elapsedMs < 45000) return "hace unos segundos";
  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes < 1) return "hace 1 min";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
