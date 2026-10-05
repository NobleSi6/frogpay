'use client';

import { useState } from 'react';
import {
  paymentsService,
  type CreatePaymentDTO,
} from '../services/payments.service';

export function useCreatePayment() {
  const [isPending, setIsPending] = useState(false);

  async function mutateAsync(data: CreatePaymentDTO) {
    setIsPending(true);
    try {
      return await paymentsService.createPayment(data, crypto.randomUUID());
    } finally {
      setIsPending(false);
    }
  }

  return { mutateAsync, isPending };
}
