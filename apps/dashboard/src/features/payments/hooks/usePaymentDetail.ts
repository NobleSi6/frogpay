import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { paymentsService } from '../services/payments.service';

export function usePaymentDetail(id: string) {
  return useQuery({
    queryKey: ['payment-detail', id],
    queryFn: () => paymentsService.getPaymentById(id),
    enabled: Boolean(id),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });
}