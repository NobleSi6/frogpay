import { useEffect, useState } from 'react';
import { paymentsService } from '../services/payments.service';
import type { PaymentDetail } from '../services/payments.service';

export function usePaymentDetail(id: string) {
  const [result, setResult] = useState<{
    id: string;
    data?: PaymentDetail;
    error?: unknown;
  }>();

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    paymentsService.getPaymentById(id).then(
      (data) => {
        if (!cancelled) setResult({ id, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ id, error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isCurrentResult = result?.id === id;

  return {
    data: isCurrentResult ? result.data : undefined,
    isLoading: Boolean(id) && !isCurrentResult,
    isError: isCurrentResult && result.error !== undefined,
    error: isCurrentResult ? result.error : undefined,
  };
}