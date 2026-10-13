import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SPRINT1_DEMO_MODE } from '@/lib/demo-mode';
import { paymentsService } from '../services/payments.service';
import type { PaymentDetail } from '../services/payments.service';

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
    mutationFn: async (result: 'APPROVED' | 'REJECTED') => {
      if (SPRINT1_DEMO_MODE) {
        await paymentsService.simulateQrPayment(paymentId, result);
      }
    },
    onMutate: async (result) => {
      const queryKey = ['payment-detail', paymentId];
      await queryClient.cancelQueries({ queryKey });
      const previousPayment = queryClient.getQueryData<PaymentDetail>(queryKey);
      queryClient.setQueryData<PaymentDetail>(queryKey, (current) => {
        if (!current) return current;
        const timestamp = new Date().toLocaleTimeString('es-BO');
        return {
          ...current,
          status: result,
          timeline: [
            ...current.timeline.map((event) => ({ ...event, isCurrent: false })),
            { status: result.toLowerCase(), timestamp, isCurrent: true },
          ],
        };
      });
      return { previousPayment };
    },
    onError: (_error, _result, context) => {
      if (context?.previousPayment) {
        queryClient.setQueryData(['payment-detail', paymentId], context.previousPayment);
      }
    },
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