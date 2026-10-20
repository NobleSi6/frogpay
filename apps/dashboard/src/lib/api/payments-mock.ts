import { ApiError } from "@/lib/api-client";
import type {
  Payment,
  PaymentListParams,
  PaymentListResponse,
  PaymentSortBy,
  PaymentSortOrder,
  PaymentStatus,
} from "./payments";

export const MOCK_PAYMENT_COUNT = 120;
export const MOCK_LATENCY_MS = 300;

const MOCK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MOCK_COMMISSION_RATE = 3;

const MOCK_STATUSES: PaymentStatus[] = [
  "pending",
  "approved",
  "rejected",
  "failed",
  "expired",
  "refunded",
  "partially_refunded",
];
const MOCK_METHODS = ["card", "qr", "bank_transfer"] as const;
const MOCK_ERROR_CODES = [
  "card_declined",
  "insufficient_funds",
  "processing_error",
  "provider_timeout",
  "expired_card",
];
const MOCK_ERROR_STATUSES = [400, 401, 403, 429, 500];

export interface MockListOptions {
  now?: number;
  latencyMs?: number;
  payments?: Payment[];
}

function hexSequence(seed: number, length: number): string {
  let state = seed >>> 0;
  let out = "";
  while (out.length < length) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out += ((t ^ (t >>> 14)) >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

function mockUuid(index: number): string {
  const hex = hexSequence(index + 1, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

function isoAt(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function generateMockPayments(options: { now?: number; count?: number } = {}): Payment[] {
  const count = options.count ?? MOCK_PAYMENT_COUNT;
  const now = options.now ?? Date.now();
  const payments: Payment[] = [];

  for (let index = 0; index < count; index += 1) {
    const status = MOCK_STATUSES[index % MOCK_STATUSES.length];
    const paymentMethod = MOCK_METHODS[index % MOCK_METHODS.length];
    const environment = index % 4 === 0 ? "production" : "sandbox";
    const currency = index % 5 === 0 ? "USD" : "BOB";
    const amountCents = 10000 + ((index * 7919) % 490000);
    const createdAtMs =
      now - Math.floor((index * MOCK_WINDOW_MS) / count) - (index % 7) * 37 * 1000;
    const updatedAtMs = createdAtMs + (index % 13) * 1000;
    const amount = centsToDecimal(amountCents);
    const settled = status === "approved" || status === "refunded" || status === "partially_refunded";
    const commissionCents = Math.round((amountCents * MOCK_COMMISSION_RATE) / 100);
    const netCents =
      status === "refunded"
        ? 0
        : status === "partially_refunded"
          ? Math.round(amountCents / 2) - commissionCents
          : amountCents - commissionCents;
    const providerTransactionId =
      paymentMethod === "bank_transfer"
        ? `BT-2026-${hexSequence(index + 1300, 6).toUpperCase()}`
        : paymentMethod === "qr"
          ? `qr_${hexSequence(index + 900, 16)}`
          : `ch_${hexSequence(index + 500, 16)}`;

    payments.push({
      id: mockUuid(index),
      status,
      amount,
      currency,
      paymentMethod,
      environment,
      merchantReference: `ORD-2026-${String(index + 1).padStart(4, "0")}`,
      commissionAmount: settled ? centsToDecimal(commissionCents) : null,
      netAmount: settled ? centsToDecimal(netCents) : null,
      providerTransactionId,
      errorCode:
        status === "rejected" || status === "failed" ? MOCK_ERROR_CODES[index % MOCK_ERROR_CODES.length] : null,
      expiresAt: status === "pending" ? isoAt(createdAtMs + 15 * 60 * 1000) : null,
      bankInstructions:
        paymentMethod === "bank_transfer" && status === "pending"
          ? {
              bankName: "Banco FrogPay Simulado",
              accountNumber: `100000${1000 + index}`,
              accountHolder: "FrogPay Bolivia",
              amount,
              currency,
              reference: providerTransactionId,
            }
          : null,
      qrPayload:
        paymentMethod === "qr" && status === "pending"
          ? `00020101021226680014BR.GOV.BCB.PIX${hexSequence(index + 2000, 28)}`
          : null,
      createdAt: isoAt(createdAtMs),
      updatedAt: isoAt(updatedAtMs),
    });
  }

  return payments;
}

let defaultDataset: Payment[] | null = null;

function getDefaultMockPayments(): Payment[] {
  if (!defaultDataset) defaultDataset = generateMockPayments();
  return defaultDataset;
}

function parseBoundary(value: string | undefined, field: "from" | "to"): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ApiError(
      400,
      `El parámetro ${field} debe ser una fecha ISO-8601 válida.`,
      "validation_error",
      { field },
      `req_mock_validation_${field}`,
    );
  }
  return parsed;
}

export function filterMockPayments(payments: Payment[], params: PaymentListParams = {}): Payment[] {
  const fromMs = parseBoundary(params.from, "from");
  const toMs = parseBoundary(params.to, "to");
  const search = params.search?.trim().toLowerCase() ?? "";

  return payments.filter((payment) => {
    if (params.status && payment.status !== params.status) return false;
    if (params.paymentMethod && payment.paymentMethod !== params.paymentMethod) return false;
    if (params.environment && payment.environment !== params.environment) return false;
    if (fromMs !== null && Date.parse(payment.createdAt) < fromMs) return false;
    if (toMs !== null && Date.parse(payment.createdAt) >= toMs) return false;
    if (search) {
      const matchesReference = payment.merchantReference.toLowerCase().includes(search);
      const matchesIdPrefix = payment.id.toLowerCase().startsWith(search);
      if (!matchesReference && !matchesIdPrefix) return false;
    }
    return true;
  });
}

export function compareDecimalStrings(left: string, right: string): number {
  const parse = (raw: string) => {
    const value = raw.trim();
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = value.replace(/^[+-]/, "").split(".");
    return { negative, whole: whole.replace(/^0+(?=\d)/, ""), fraction };
  };
  const a = parse(left);
  const b = parse(right);
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const sign = a.negative ? -1 : 1;

  if (a.whole.length !== b.whole.length) return (a.whole.length < b.whole.length ? -1 : 1) * sign;
  if (a.whole !== b.whole) return (a.whole < b.whole ? -1 : 1) * sign;

  const width = Math.max(a.fraction.length, b.fraction.length);
  const fractionA = a.fraction.padEnd(width, "0");
  const fractionB = b.fraction.padEnd(width, "0");
  if (fractionA === fractionB) return 0;
  return (fractionA < fractionB ? -1 : 1) * sign;
}

export function sortMockPayments(
  payments: Payment[],
  sortBy: PaymentSortBy = "createdAt",
  sortOrder: PaymentSortOrder = "desc",
): Payment[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...payments].sort((left, right) => {
    let primary = 0;
    if (sortBy === "amount") primary = compareDecimalStrings(left.amount, right.amount);
    else if (sortBy === "status") primary = left.status < right.status ? -1 : left.status > right.status ? 1 : 0;
    else primary = left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;
    if (primary !== 0) return primary * direction;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return 25;
  const parsed = Math.floor(Number(limit));
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(parsed, 100);
}

function normalizePage(page: number | undefined): number {
  if (page === undefined) return 1;
  const parsed = Math.floor(Number(page));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export function getForcedMockErrorStatus(): number | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined" || !window.location?.search) return null;
  const raw = new URLSearchParams(window.location.search).get("mockError");
  if (!raw) return null;
  const status = Number(raw);
  return MOCK_ERROR_STATUSES.includes(status) ? status : null;
}

export function createMockApiError(status: number): ApiError {
  if (status === 400) {
    return new ApiError(400, "Parámetros de consulta inválidos.", "validation_error", { mock: true }, "req_mock_400");
  }
  if (status === 401) {
    return new ApiError(401, "Tu sesión venció o no es válida.", undefined, { mock: true }, "req_mock_401");
  }
  if (status === 403) {
    return new ApiError(403, "No tienes permisos para consultar las transacciones.", undefined, { mock: true }, "req_mock_403");
  }
  if (status === 429) {
    return new ApiError(
      429,
      "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.",
      "rate_limit_exceeded",
      { mock: true, retryAfterSeconds: 10 },
      "req_mock_429",
    );
  }
  return new ApiError(500, "Error del servidor. Inténtalo de nuevo más tarde.", undefined, { mock: true }, "req_mock_500");
}

export async function mockListPayments(
  params: PaymentListParams = {},
  options: MockListOptions = {},
): Promise<PaymentListResponse> {
  const forcedStatus = getForcedMockErrorStatus();
  if (forcedStatus !== null) throw createMockApiError(forcedStatus);

  const latencyMs = options.latencyMs ?? MOCK_LATENCY_MS;
  if (latencyMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));

  const source =
    options.payments ?? (options.now !== undefined ? generateMockPayments({ now: options.now }) : getDefaultMockPayments());

  const filtered = filterMockPayments(source, params);
  const sorted = sortMockPayments(filtered, params.sortBy ?? "createdAt", params.sortOrder ?? "desc");
  const limit = normalizeLimit(params.limit);
  const page = normalizePage(params.page);
  const total = sorted.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;

  return { data: sorted.slice(start, start + limit), page, limit, total, totalPages };
}
