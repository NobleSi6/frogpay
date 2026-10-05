import { useEffect, useState } from 'react';
import { paymentsService } from '../services/payments.service';
import type { PaymentDetail } from '../services/payments.service';

export function usePaymentDetail(id: string) {
  const [data, setData] = useState<PaymentDetail>();
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!id) {
      setData(undefined);
      setIsLoading(false);
      setIsError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    paymentsService.getPaymentById(id).then(
      (payment) => {
        if (cancelled) return;
        setData(payment);
        setIsLoading(false);
      },
      () => {
        if (cancelled) return;
        setData(undefined);
        setIsError(true);
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, isLoading, isError };
}