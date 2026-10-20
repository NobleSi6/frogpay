import { useQuery } from '@tanstack/react-query';
import {
  reconciliationService,
  type BankTransactionFilters,
} from '../services/reconciliation.service';

export function useReconciliation(page: number, filters: BankTransactionFilters = {}) {
  const query = useQuery({
    queryKey: ['bank-transactions', page, filters.status ?? null, filters.from ?? null, filters.to ?? null],
    queryFn: () => reconciliationService.getBankTransactions(page, 20, filters),
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
