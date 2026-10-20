import type {
  PaymentEnvironment,
  PaymentListParams,
  PaymentMethod,
  PaymentSortBy,
  PaymentSortOrder,
  PaymentStatus,
} from "@/lib/api/payments";

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_PAGE = 1;
export const DEFAULT_SORT_BY: PaymentSortBy = "createdAt";
export const DEFAULT_SORT_ORDER: PaymentSortOrder = "desc";

export type DateShortcut = "today" | "last7" | "last30";

export interface TransactionFilters {
  status: PaymentStatus | "";
  paymentMethod: PaymentMethod | "";
  environment: PaymentEnvironment | "";
  /** Día local (America/La_Paz) inclusivo. */
  from: string;
  /** Día local (America/La_Paz) inclusivo en la interfaz; se envía como `to` exclusivo. */
  to: string;
  search: string;
  page: number;
  limit: number;
  sortBy: PaymentSortBy;
  sortOrder: PaymentSortOrder;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  failed: "Fallido",
  expired: "Expirado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Tarjeta",
  qr: "QR",
  bank_transfer: "Transferencia",
};

export const PAYMENT_ENVIRONMENT_LABELS: Record<PaymentEnvironment, string> = {
  sandbox: "Sandbox",
  production: "Producción",
};

const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
const PAYMENT_ENVIRONMENTS = Object.keys(PAYMENT_ENVIRONMENT_LABELS) as PaymentEnvironment[];
const SORT_FIELDS: PaymentSortBy[] = ["createdAt", "amount", "status"];
const SORT_ORDERS: PaymentSortOrder[] = ["asc", "desc"];

export const STATUS_OPTIONS: Array<{ value: PaymentStatus | ""; label: string }> = [
  { value: "", label: "Todos los estados" },
  ...PAYMENT_STATUSES.map((value) => ({ value, label: PAYMENT_STATUS_LABELS[value] })),
];

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod | ""; label: string }> = [
  { value: "", label: "Todos los métodos" },
  ...PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] })),
];

export const ENVIRONMENT_OPTIONS: Array<{ value: PaymentEnvironment | ""; label: string }> = [
  { value: "", label: "Todos los ambientes" },
  ...PAYMENT_ENVIRONMENTS.map((value) => ({ value, label: PAYMENT_ENVIRONMENT_LABELS[value] })),
];

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** America/La_Paz es UTC-4 sin horario de verano: la medianoche local es 04:00 UTC. */
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;

function parseDay(day: string): number | null {
  if (!DAY_PATTERN.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, date);
  const check = new Date(timestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) {
    return null;
  }
  return timestamp;
}

function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** Inicio del día local en ISO-8601 UTC (desde inclusivo). */
export function dayStartUtc(day: string): string | undefined {
  const timestamp = parseDay(day);
  if (timestamp === null) return undefined;
  return new Date(timestamp + LA_PAZ_OFFSET_MS).toISOString();
}

/** Inicio del día siguiente en ISO-8601 UTC (hasta exclusivo). */
export function nextDayStartUtc(day: string): string | undefined {
  const timestamp = parseDay(day);
  if (timestamp === null) return undefined;
  return new Date(timestamp + DAY_MS + LA_PAZ_OFFSET_MS).toISOString();
}

function todayInLaPaz(now: Date): string {
  return formatDay(now.getTime() - LA_PAZ_OFFSET_MS);
}

export function getDateRangeShortcut(shortcut: DateShortcut, now: Date = new Date()): { from: string; to: string } {
  const today = todayInLaPaz(now);
  const daysBack = shortcut === "today" ? 0 : shortcut === "last7" ? 6 : 29;
  const todayTimestamp = parseDay(today) ?? 0;
  return { from: formatDay(todayTimestamp - daysBack * DAY_MS), to: today };
}

export function getDefaultTransactionFilters(): TransactionFilters {
  return {
    status: "",
    paymentMethod: "",
    environment: "",
    from: "",
    to: "",
    search: "",
    page: DEFAULT_PAGE,
    limit: DEFAULT_PAGE_SIZE,
    sortBy: DEFAULT_SORT_BY,
    sortOrder: DEFAULT_SORT_ORDER,
  };
}

function readEnum<T extends string>(searchParams: URLSearchParams, key: string, allowed: T[]): T | "" {
  const raw = searchParams.get(key);
  return raw && (allowed as string[]).includes(raw) ? (raw as T) : "";
}

function readDay(searchParams: URLSearchParams, key: string): string {
  const raw = searchParams.get(key);
  return raw && parseDay(raw) !== null ? raw : "";
}

function readInteger(searchParams: URLSearchParams, key: string, fallback: number, minimum: number): number {
  const raw = searchParams.get(key);
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback;
}

export function parseTransactionFilters(searchParams: URLSearchParams): TransactionFilters {
  const defaults = getDefaultTransactionFilters();
  const limit = readInteger(searchParams, "limit", DEFAULT_PAGE_SIZE, 1);
  const sort = readEnum(searchParams, "sortBy", SORT_FIELDS);
  const order = readEnum(searchParams, "sortOrder", SORT_ORDERS);

  return {
    status: readEnum(searchParams, "status", PAYMENT_STATUSES),
    paymentMethod: readEnum(searchParams, "paymentMethod", PAYMENT_METHODS),
    environment: readEnum(searchParams, "environment", PAYMENT_ENVIRONMENTS),
    from: readDay(searchParams, "from"),
    to: readDay(searchParams, "to"),
    search: searchParams.get("search") ?? defaults.search,
    page: readInteger(searchParams, "page", DEFAULT_PAGE, 1),
    limit: (PAGE_SIZE_OPTIONS as readonly number[]).includes(limit) ? limit : DEFAULT_PAGE_SIZE,
    sortBy: sort || DEFAULT_SORT_BY,
    sortOrder: order || DEFAULT_SORT_ORDER,
  };
}

export function serializeTransactionFilters(filters: TransactionFilters): string {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.paymentMethod) query.set("paymentMethod", filters.paymentMethod);
  if (filters.environment) query.set("environment", filters.environment);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const search = filters.search.trim();
  if (search) query.set("search", search);
  if (filters.page !== DEFAULT_PAGE) query.set("page", String(filters.page));
  if (filters.limit !== DEFAULT_PAGE_SIZE) query.set("limit", String(filters.limit));
  if (filters.sortBy !== DEFAULT_SORT_BY) query.set("sortBy", filters.sortBy);
  if (filters.sortOrder !== DEFAULT_SORT_ORDER) query.set("sortOrder", filters.sortOrder);
  return query.toString();
}

/** Convierte el estado de la interfaz en los parámetros del contrato GET /dashboard/payments. */
export function filtersToApiParams(filters: TransactionFilters): PaymentListParams {
  const params: PaymentListParams = {
    page: filters.page,
    limit: filters.limit,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };
  if (filters.status) params.status = filters.status;
  if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
  if (filters.environment) params.environment = filters.environment;
  const from = dayStartUtc(filters.from);
  if (from) params.from = from;
  const to = nextDayStartUtc(filters.to);
  if (to) params.to = to;
  const search = filters.search.trim();
  if (search) params.search = search;
  return params;
}

export function hasActiveTransactionFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.status ||
      filters.paymentMethod ||
      filters.environment ||
      filters.from ||
      filters.to ||
      filters.search.trim(),
  );
}
