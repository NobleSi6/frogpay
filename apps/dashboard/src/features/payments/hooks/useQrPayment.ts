import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsService } from '../services/payments.service';

export function useQrPayment(paymentId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['payment-detail', paymentId],
    queryFn: () => paymentsService.getPaymentById(paymentId),
    enabled: Boolean(paymentId),
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      return currentStatus === 'PENDING' ? 2000 : false;
    },
  });

  const simulateMutation = useMutation({
    mutationFn: (result: 'APPROVED' | 'REJECTED') =>
      paymentsService.simulateQrPayment(paymentId, result === 'REJECTED' ? 'FAILED' : result),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payment-detail', paymentId] }),
        queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] }),
      ]);
    },
  });

  return {
    ...query,
    status: query.data?.status,
    simulatePayment: simulateMutation.mutate,
    isSimulating: simulateMutation.isPending,
    simulationError: simulateMutation.error,
    expirePayment: query.refetch,
  };
}