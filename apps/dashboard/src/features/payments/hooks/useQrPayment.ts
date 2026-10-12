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
    mutationFn: (result: 'APPROVED' | 'FAILED') =>
      paymentsService.simulateQrPayment(paymentId, result),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-detail', paymentId] }),
  });

  const expireMutation = useMutation({
    mutationFn: () => paymentsService.expireMockQrPayment(paymentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-detail', paymentId] }),
  });

  return {
    ...query,
    status: query.data?.status,
    simulatePayment: simulateMutation.mutate,
    isSimulating: simulateMutation.isPending,
    simulationError: simulateMutation.error,
    expirePayment: expireMutation.mutate,
  };
}