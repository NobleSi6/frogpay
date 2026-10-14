import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bankTransferService,
  type BankSimulationType,
} from '../services/bank-transfer.service';

export function useBankTransfer(paymentId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['bank-transfer-status', paymentId];

  const query = useQuery({
    queryKey,
    queryFn: () => bankTransferService.getBankTransferStatus(paymentId),
    enabled: Boolean(paymentId),
    refetchInterval: (currentQuery) =>
      currentQuery.state.data === 'PENDING' ? 2000 : false,
  });

  const simulateDepositMutation = useMutation({
    mutationFn: (simulationType: BankSimulationType) =>
      bankTransferService.simulateBankDeposit(paymentId, simulationType),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ['payment-detail', paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['bank-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] }),
      ]);
    },
  });

  return {
    ...query,
    status: query.data,
    simulateDeposit: simulateDepositMutation.mutate,
    isSimulating: simulateDepositMutation.isPending,
    simulationError: simulateDepositMutation.error,
    expirePayment: query.refetch,
  };
}
