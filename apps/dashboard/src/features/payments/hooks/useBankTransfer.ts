import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SPRINT1_DEMO_MODE } from '@/lib/demo-mode';
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
  });

  const expireMutation = useMutation({
    mutationFn: () => bankTransferService.expireMockBankTransfer(paymentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const expireMockBankTransfer = expireMutation.mutate;
  const expirePayment = useCallback(() => {
    if (SPRINT1_DEMO_MODE) {
      expireMockBankTransfer();
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['bank-transfer-status', paymentId] });
  }, [expireMockBankTransfer, paymentId, queryClient]);

  return {
    ...query,
    status: query.data,
    simulateDeposit: simulateDepositMutation.mutate,
    isSimulating: simulateDepositMutation.isPending,
    simulationError: simulateDepositMutation.error,
    expirePayment,
  };
}
