import { apiRequest } from "@/lib/api-client";

export type ReconciliationStatus =
  | "CONCILIATED"
  | "WITHOUT_REFERENCE"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH";

export interface BankTransaction {
  id: string;
  reference: string;
  createdAt: string;
  bankName: string;
  amount: number;
  currency: string;
  status: ReconciliationStatus;
  paymentId: string | null;
}

export interface BankTransactionPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface BankTransactionResponse {
  id: string;
  reference: string;
  amount: string;
  currency: string;
  bankName: string;
  receivedAt: string;
  status: "reconciled" | "amount_mismatch" | "currency_mismatch" | "unmatched" | "reference_not_found";
  paymentId: string | null;
  createdAt: string;
}

export type BankTransactionStatusFilter =
  | "reconciled"
  | "amount_mismatch"
  | "currency_mismatch"
  | "unmatched";

export interface BankTransactionFilters {
  status?: BankTransactionStatusFilter;
  from?: string;
  to?: string;
}

interface PaginatedBankTransactionsResponse {
  data: BankTransactionResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const statusMap: Record<BankTransactionResponse["status"], ReconciliationStatus> = {
  reconciled: "CONCILIATED",
  amount_mismatch: "AMOUNT_MISMATCH",
  currency_mismatch: "CURRENCY_MISMATCH",
  unmatched: "WITHOUT_REFERENCE",
  reference_not_found: "WITHOUT_REFERENCE",
};

export const reconciliationService = {
  getBankTransactions: async (
    page = 1,
    limit = 20,
    filters: BankTransactionFilters = {},
  ): Promise<{ transactions: BankTransaction[]; pagination: BankTransactionPagination }> => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.status) params.set("status", filters.status);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    const response = await apiRequest<PaginatedBankTransactionsResponse>(
      `/dashboard/bank-transactions?${params.toString()}`,
    );

    const transactions = response.data.map((transaction) => {
      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount)) {
        throw new Error(`El backend devolvió un monto bancario inválido para ${transaction.id}.`);
      }

      return {
        id: transaction.id,
        reference: transaction.reference,
        createdAt: new Date(transaction.receivedAt).toLocaleString("es-BO", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        bankName: transaction.bankName,
        amount,
        currency: transaction.currency,
        status: statusMap[transaction.status],
        paymentId: transaction.paymentId,
      };
    });

    return { transactions, pagination: response.pagination };
  },
};
