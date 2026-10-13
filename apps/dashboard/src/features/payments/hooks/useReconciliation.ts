import { useQuery } from '@tanstack/react-query';
import { reconciliationService, BankTransaction } from '../services/reconciliation.service';

export function useReconciliation() {
  const query = useQuery<BankTransaction[]>({
    queryKey: ['bank-transactions'],
    queryFn: () => reconciliationService.getBankTransactions(),
  });

  return {
    transactions: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}