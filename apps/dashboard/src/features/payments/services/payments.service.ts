import { apiRequest } from "@/lib/api-client";
import type { PaymentEnvironment } from "@/features/provider-credentials/provider-credentials-client";

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export interface CreateQrPaymentInput {
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export type PaymentStatus = 'APPROVED' | 'REJECTED' | 'FAILED' | 'PENDING' | 'EXPIRED';
export type PaymentMethodType = 'card' | 'qr' | 'bank_transfer';

export interface PaymentResponse {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed' | 'expired';
  amount: string;
  currency: string;
  paymentMethod: PaymentMethodType;
  environment: 'sandbox' | 'production';
  merchantReference: string;
  commissionAmount: string | null;
  netAmount: string | null;
  providerTransactionId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QrPaymentResponse extends PaymentResponse {
  qrPayload?: string | null;
  expiresAt?: string | null;
}

export interface PaymentDetail {
  id: string;
  amount: number;
  currency: string;
  fee: number;
  net: number;
  paymentMethod: PaymentMethodType;
  environment: PaymentEnvironment;
  merchantReference: string;
  status: PaymentStatus;
  errorCode: string | null;
  createdAt: string;
  qrPayload?: string;
  expiresAt?: string;
  timeline: Array<{
    status: string;
    timestamp: string;
    isCurrent?: boolean;
  }>;
}

interface PaymentDetailsResponse extends PaymentResponse {
  qrPayload?: string;
  expiresAt?: string;
  statusHistory: Array<{
    previousStatus: string | null;
    newStatus: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

export const paymentsService = {
  // Pago con Tarjeta (Sprint 2)
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

  // Pago con QR (Sprint 3 - TSK-DEV1-302)
  createQrPayment: async (data: CreateQrPaymentInput): Promise<QrPaymentResponse> => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('El monto debe ser un número mayor a cero.');
    }

    return apiRequest<QrPaymentResponse>('/dashboard/payments/test', {
      method: 'POST',
      headers: { 'Idempotency-Key': data.idempotencyKey },
      body: JSON.stringify({
        amount: data.amount.toFixed(2),
        currency: data.currency,
        paymentMethod: 'qr',
        merchantReference: `DASH-QR-${data.idempotencyKey}`,
      }),
    });
  },

  // Simulación de Pago QR en Sandbox (dashboard BFF)
  simulateQrPayment: async (
    paymentId: string,
    result: 'APPROVED' | 'FAILED',
  ): Promise<{ paymentId: string; status: string; changed: boolean }> => {
    return apiRequest<{ paymentId: string; status: string; changed: boolean }>(
      `/dashboard/payments/${encodeURIComponent(paymentId)}/simulate`,
      {
        method: 'POST',
        body: JSON.stringify({ result }),
      },
    );
  },

  // Obtener Detalle de Pago por ID (Compatible con Tarjeta y QR)
  getPaymentById: async (id: string): Promise<PaymentDetail> => {
    const payment = await apiRequest<PaymentDetailsResponse>(
      `/dashboard/payments/${encodeURIComponent(id)}`,
    );
    const amount = Number(payment.amount);
    const fee = Number(payment.commissionAmount ?? 0);
    const normalizedStatus = payment.status.toUpperCase();
    
    let status: PaymentStatus = 'PENDING';
    if (['APPROVED', 'REJECTED', 'FAILED', 'EXPIRED'].includes(normalizedStatus)) {
      status = normalizedStatus as PaymentStatus;
    }

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
      qrPayload: payment.qrPayload,
      expiresAt: payment.expiresAt,
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