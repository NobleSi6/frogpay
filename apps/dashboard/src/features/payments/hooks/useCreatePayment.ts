'use client';

import { useState } from 'react';
import { paymentsService, type CreatePaymentInput } from '../services/payments.service';

export function useCreatePayment() {
  const [isPending, setIsPending] = useState(false);

  async function mutateAsync(data: CreatePaymentInput) {
    setIsPending(true);
    try {
      return await paymentsService.createPayment(data);
    } finally {
      setIsPending(false);
    }
  }

  return { mutateAsync, isPending };
}