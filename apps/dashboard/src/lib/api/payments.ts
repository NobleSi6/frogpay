import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api-client";
import { mockListPayments, MOCK_LATENCY_MS } from "./payments-mock";

export { ApiError };

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded";

export type PaymentMethod = "card" | "qr" | "bank_transfer";

export type PaymentEnvironment = "sandbox" | "production";

export type PaymentSortBy = "createdAt" | "amount" | "status";

export type PaymentSortOrder = "asc" | "desc";

export interface PaymentBankInstructions {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: string;
  currency: string;
  reference: string;
}

export interface Payment {
  id: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  paymentMethod: PaymentMethod;
  environment: PaymentEnvironment;
  merchantReference: string;
  commissionAmount: string | null;
  netAmount: string | null;
  providerTransactionId: string;
  errorCode: string | null;
  expiresAt: string | null;
  bankInstructions: PaymentBankInstructions | null;
  qrPayload: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentListParams {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  from?: string;
  to?: string;
  paymentMethod?: PaymentMethod;
  environment?: PaymentEnvironment;
  search?: string;
  sortBy?: PaymentSortBy;
  sortOrder?: PaymentSortOrder;
}

export interface PaymentListResponse {
  data: Payment[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const PAYMENTS_ENDPOINT = "/dashboard/payments";

/**
 * NEXT_PUBLIC_USE_MOCKS gobierna la fuente de datos de `listPayments`.
 * Solo se usa el simulador local cuando la variable vale exactamente "true"
 * y el build no es de producción; en cualquier otro caso (sin definir,
 * "false" o build de producción) se llama a GET /dashboard/payments con el
 * cliente HTTP existente.
 */
export const USE_MOCK_PAYMENTS =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export function buildPaymentsQueryString(params: PaymentListParams = {}): string {
  const query = new URLSearchParams();
  const entries: Array<[string, string | number | undefined]> = [
    ["page", params.page],
    ["limit", params.limit],
    ["status", params.status],
    ["from", params.from],
    ["to", params.to],
    ["paymentMethod", params.paymentMethod],
    ["environment", params.environment],
    ["search", params.search],
    ["sortBy", params.sortBy],
    ["sortOrder", params.sortOrder],
  ];
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
}

export async function listPayments(
  params: PaymentListParams = {},
  signal?: AbortSignal,
): Promise<PaymentListResponse> {
  if (USE_MOCK_PAYMENTS) {
    return mockListPayments(params, { latencyMs: MOCK_LATENCY_MS });
  }
  const query = buildPaymentsQueryString(params);
  return apiRequest<PaymentListResponse>(query ? `${PAYMENTS_ENDPOINT}?${query}` : PAYMENTS_ENDPOINT, { signal });
}

export function usePaymentsList(params: PaymentListParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["payments", "list", params],
    queryFn: ({ signal }: { signal: AbortSignal }) => listPayments(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    retry: (failureCount: number, error: unknown) =>
      error instanceof ApiError ? error.status === 0 && failureCount < 1 : failureCount < 2,
  });
}
