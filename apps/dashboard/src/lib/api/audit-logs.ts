import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api-client";

export interface AuditLogRecord {
  eventId: string;
  entity: string;
  entityId: string | null;
  action: string;
  /** Objeto JSON (p. ej. `{ status: "approved" }`) o null. */
  previousState: unknown;
  /** Objeto JSON (p. ej. `{ status: "pending" }`) o null. */
  newState: unknown;
  actor: AuditActor | null;
  requestId: string | null;
  environment: string;
  createdAt: string;
}

export interface AuditActor {
  type?: string;
  id?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AuditLogListParams {
  page?: number;
  limit?: number;
  paymentId?: string;
  action?: string;
  /** ISO-8601 UTC inclusivo. */
  from?: string;
  /** ISO-8601 UTC exclusivo. */
  to?: string;
}

export interface AuditLogListResponse {
  data: AuditLogRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const AUDIT_LOGS_ENDPOINT = "/dashboard/audit-logs";
export const AUDIT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_AUDIT_PAGE_SIZE = 25;

/**
 * Valores reales de `action` que escribe el backend (AuditEventHandler,
 * controladores de webhooks, API keys y credenciales de proveedor).
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "pago.creado": "Pago creado",
  "pago.aprobado": "Pago aprobado",
  "pago.rechazado": "Pago rechazado",
  "pago.reembolsado": "Pago reembolsado",
  "webhook.creado": "Webhook creado",
  "webhook.actualizado": "Webhook actualizado",
  "webhook.eliminado": "Webhook eliminado",
  "webhook.secret.rotado": "Secreto de webhook rotado",
  "api_key.creada": "API key creada",
  "api_key.regenerada": "API key regenerada",
  "api_key.revocada": "API key revocada",
  "credencial.proveedor.actualizada": "Credencial de proveedor actualizada",
};

export const AUDIT_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todas las acciones" },
  ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

export function auditActionLabel(action: string | null | undefined): string {
  if (!action) return "—";
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/**
 * Contrato GET /dashboard/audit-logs: page, limit, paymentId, action, from y to.
 * `from` es inclusivo y `to` exclusivo; el tenant se deriva del JWT.
 */
export function buildAuditLogQueryString(params: AuditLogListParams = {}): string {
  const query = new URLSearchParams();
  const entries: Array<[string, string | number | undefined]> = [
    ["page", params.page],
    ["limit", params.limit],
    ["paymentId", params.paymentId],
    ["action", params.action],
    ["from", params.from],
    ["to", params.to],
  ];
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
}

export async function listAuditLogs(
  params: AuditLogListParams = {},
  signal?: AbortSignal,
): Promise<AuditLogListResponse> {
  const query = buildAuditLogQueryString(params);
  return apiRequest<AuditLogListResponse>(
    query ? `${AUDIT_LOGS_ENDPOINT}?${query}` : AUDIT_LOGS_ENDPOINT,
    { signal },
  );
}

export function useAuditLogs(
  params: AuditLogListParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["audit-logs", "list", params],
    queryFn: ({ signal }) => listAuditLogs(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    retry: (failureCount, error) =>
      error instanceof ApiError
        ? (error.status === 0 || error.status === 429) && failureCount < 1
        : failureCount < 2,
  });
}

/**
 * Extrae el estado de previousState/newState del backend
 * (`{ status: "approved" }`, string plano o null).
 */
export function auditStateValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "object") {
    const status = (value as { status?: unknown }).status;
    if (typeof status === "string" && status.trim() !== "") return status;
  }
  return null;
}

const AUDIT_STATE_FALLBACK_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  failed: "Fallido",
  expired: "Expirado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
};

function auditStateLabel(state: string): string {
  return AUDIT_STATE_FALLBACK_LABELS[state] ?? state;
}

/** "pendiente → aprobado"; si previousState es null, solo el estado nuevo. */
export function formatAuditTransition(previousState: unknown, newState: unknown): string {
  const previous = auditStateValue(previousState);
  const next = auditStateValue(newState);
  if (previous && next) return `${auditStateLabel(previous)} → ${auditStateLabel(next)}`;
  if (next) return auditStateLabel(next);
  if (previous) return auditStateLabel(previous);
  return "—";
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Etiqueta legible del actor sin exponer identificadores internos.
 * Usuario → "Usuario · OWNER"; sistema → "Sistema · payment-events"; API → "API".
 */
export function formatAuditActor(actor: AuditActor | null | undefined): string {
  if (!actor || typeof actor !== "object") return "—";
  const type = typeof actor.type === "string" ? actor.type.toLowerCase() : "";
  if (type === "user") {
    const role = typeof actor.role === "string" && actor.role ? actor.role : null;
    return role ? `Usuario · ${role}` : "Usuario";
  }
  if (type === "system") {
    const id = typeof actor.id === "string" ? actor.id : "";
    const name = id && !UUID_LIKE.test(id) ? id : null;
    return name ? `Sistema · ${name}` : "Sistema";
  }
  if (type === "api") return "API";
  return "—";
}

/** JSON de solo lectura para el panel lateral (pretty). */
export function formatAuditStateJson(value: unknown): string {
  if (value === null || value === undefined) return "Sin estado registrado";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
