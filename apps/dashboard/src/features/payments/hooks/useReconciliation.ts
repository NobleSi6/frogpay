import { useQuery } from '@tanstack/react-query';
import { reconciliationService } from '../services/reconciliation.service';

export function useReconciliation(page = 1) {
  const query = useQuery({
    queryKey: ['bank-transactions', page],
    queryFn: () => reconciliationService.getBankTransactions(page),
  });

  return {
    transactions: query.data?.transactions ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}