import { apiRequest } from '@/lib/api-client';

export type ReconciliationStatus =
  | 'CONCILIATED'
  | 'WITHOUT_REFERENCE'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH';

export interface BankTransaction {
  id: string;
  reference: string;
  createdAt: string;
  bankName: string;
  amount: number;
  currency: string;
  status: ReconciliationStatus;
  paymentId?: string;
}

interface BankTransactionsResponse {
  data: Array<{
    id: string;
    reference: string;
    amount: string;
    currency: string;
    bankName: string;
    receivedAt: string;
    status: 'reconciled' | 'amount_mismatch' | 'currency_mismatch' | 'unmatched';
    paymentId: string | null;
  }>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function mapStatus(status: BankTransactionsResponse['data'][number]['status']): ReconciliationStatus {
  switch (status) {
    case 'reconciled':
      return 'CONCILIATED';
    case 'amount_mismatch':
      return 'AMOUNT_MISMATCH';
    case 'currency_mismatch':
      return 'CURRENCY_MISMATCH';
    case 'unmatched':
      return 'WITHOUT_REFERENCE';
  }
}

export const reconciliationService = {
  getBankTransactions: async (): Promise<BankTransaction[]> => {
    const response = await apiRequest<BankTransactionsResponse>(
      '/dashboard/bank-transactions?page=1&limit=100',
    );

    return response.data.map((transaction) => {
      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount)) {
        throw new Error(`El backend devolvió un monto inválido para la transacción ${transaction.id}.`);
      }

      return {
        id: transaction.id,
        reference: transaction.reference,
        createdAt: new Date(transaction.receivedAt).toLocaleString('es-BO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        bankName: transaction.bankName,
        amount,
        currency: transaction.currency,
        status: mapStatus(transaction.status),
        paymentId: transaction.paymentId ?? undefined,
      };
    });
  },
};