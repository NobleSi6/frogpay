import {
  dayStartUtc,
  nextDayStartUtc,
  parseDay,
  type DateShortcut,
} from "../pagos/transacciones/payment-filters";
import {
  AUDIT_PAGE_SIZE_OPTIONS,
  DEFAULT_AUDIT_PAGE_SIZE,
  isValidUuid,
  type AuditLogListParams,
} from "@/lib/api/audit-logs";

export const DEFAULT_AUDIT_PAGE = 1;

export const AUDIT_DATE_SHORTCUTS: Array<{ value: DateShortcut; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "last7", label: "7 días" },
  { value: "last30", label: "30 días" },
];

export interface AuditFilters {
  /** Texto libre; solo se envía al backend si es un UUID válido. */
  paymentId: string;
  action: string;
  /** Día local (America/La_Paz) inclusivo. */
  from: string;
  /** Día local (America/La_Paz) inclusivo en la interfaz; se envía como `to` exclusivo. */
  to: string;
  page: number;
  limit: number;
}

export function getDefaultAuditFilters(): AuditFilters {
  return {
    paymentId: "",
    action: "",
    from: "",
    to: "",
    page: DEFAULT_AUDIT_PAGE,
    limit: DEFAULT_AUDIT_PAGE_SIZE,
  };
}

function readIntegerParam(
  searchParams: URLSearchParams,
  key: string,
  fallback: number,
  allowed?: readonly number[],
): number {
  const raw = searchParams.get(key);
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  if (allowed && !allowed.includes(value)) return fallback;
  return value;
}

export function parseAuditFilters(searchParams: URLSearchParams): AuditFilters {
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  return {
    paymentId: searchParams.get("paymentId") ?? "",
    action: searchParams.get("action") ?? "",
    from: fromRaw && parseDay(fromRaw) !== null ? fromRaw : "",
    to: toRaw && parseDay(toRaw) !== null ? toRaw : "",
    page: readIntegerParam(searchParams, "page", DEFAULT_AUDIT_PAGE),
    limit: readIntegerParam(
      searchParams,
      "limit",
      DEFAULT_AUDIT_PAGE_SIZE,
      AUDIT_PAGE_SIZE_OPTIONS,
    ),
  };
}

export function serializeAuditFilters(filters: AuditFilters): string {
  const query = new URLSearchParams();
  const paymentId = filters.paymentId.trim();
  if (paymentId) query.set("paymentId", paymentId);
  if (filters.action) query.set("action", filters.action);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.page !== DEFAULT_AUDIT_PAGE) query.set("page", String(filters.page));
  if (filters.limit !== DEFAULT_AUDIT_PAGE_SIZE) query.set("limit", String(filters.limit));
  return query.toString();
}

/**
 * Convierte los filtros de la interfaz en parámetros del contrato
 * GET /dashboard/audit-logs: `from` inclusivo y `to` exclusivo en ISO-8601 UTC,
 * con el día interpretado en America/La_Paz. Un paymentId que no sea UUID no se envía.
 */
export function auditFiltersToApiParams(filters: AuditFilters): AuditLogListParams {
  const params: AuditLogListParams = {
    page: filters.page,
    limit: filters.limit,
  };
  const paymentId = filters.paymentId.trim();
  if (paymentId && isValidUuid(paymentId)) params.paymentId = paymentId;
  if (filters.action) params.action = filters.action;
  const from = dayStartUtc(filters.from);
  if (from) params.from = from;
  const to = nextDayStartUtc(filters.to);
  if (to) params.to = to;
  return params;
}

export function hasActiveAuditFilters(filters: AuditFilters): boolean {
  return Boolean(
    filters.paymentId.trim() || filters.action || filters.from || filters.to,
  );
}

/** El usuario escribió un pago que no es un UUID: se avisa y no se envía al backend. */
export function isInvalidPaymentIdFilter(filters: AuditFilters): boolean {
  const paymentId = filters.paymentId.trim();
  return paymentId !== "" && !isValidUuid(paymentId);
}
