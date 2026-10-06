import { apiRequest } from "@/lib/api-client";
import type { PaymentEnvironment } from "@/features/provider-credentials/provider-credentials-client";

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export type PaymentStatus = 'APPROVED' | 'REJECTED' | 'FAILED' | 'PENDING';

export interface PaymentResponse {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
  amount: string;
  currency: string;
  paymentMethod: string;
  environment: 'sandbox' | 'production';
  merchantReference: string;
  commissionAmount: string | null;
  netAmount: string | null;
  providerTransactionId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDetail {
  id: string;
  amount: number;
  currency: string;
  fee: number;
  net: number;
  paymentMethod: string;
  environment: PaymentEnvironment;
  merchantReference: string;
  status: PaymentStatus;
  errorCode: string | null;
  createdAt: string;
  timeline: Array<{
    status: string;
    timestamp: string;
    isCurrent?: boolean;
  }>;
}

interface PaymentDetailsResponse extends PaymentResponse {
  statusHistory: Array<{
    previousStatus: string | null;
    newStatus: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

export const paymentsService = {
  createPayment: async (data: CreatePaymentInput): Promise<PaymentResponse> => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('El monto debe ser un número mayor a cero.');
    }

    return apiRequest<PaymentResponse>('/dashboard/payments/test', {
      method: 'POST',
      headers: { 'Idempotency-Key': data.idempotencyKey },
      body: JSON.stringify({
        amount: data.amount.toFixed(2),
        currency: data.currency,
        paymentMethod: 'card',
        merchantReference: `DASH-${data.idempotencyKey}`,
        paymentToken: data.paymentMethodId,
      }),
    });
  },

  getPaymentById: async (id: string): Promise<PaymentDetail> => {
    const payment = await apiRequest<PaymentDetailsResponse>(
      `/dashboard/payments/${encodeURIComponent(id)}`,
    );
    const amount = Number(payment.amount);
    const fee = Number(payment.commissionAmount ?? 0);
    const normalizedStatus = payment.status.toUpperCase();
    const status: PaymentStatus = normalizedStatus === 'APPROVED'
      || normalizedStatus === 'REJECTED'
      || normalizedStatus === 'FAILED'
      ? normalizedStatus
      : 'PENDING';
    const statusHistory = payment.statusHistory ?? [];

    return {
      id: payment.id,
      amount,
      currency: payment.currency,
      fee,
      net: Number(payment.netAmount ?? amount - fee),
      paymentMethod: payment.paymentMethod,
      environment: payment.environment,
      merchantReference: payment.merchantReference,
      status,
      errorCode: payment.errorCode,
      createdAt: new Date(payment.createdAt).toLocaleString('es-BO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      timeline: statusHistory.map((event, index) => ({
        status: event.newStatus,
        timestamp: new Date(event.createdAt).toLocaleTimeString('es-BO'),
        isCurrent: index === statusHistory.length - 1,
      })),
    };
  },
};