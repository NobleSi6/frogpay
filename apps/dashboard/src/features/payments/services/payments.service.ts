import { apiRequest } from "@/lib/api-client";
import { SPRINT1_DEMO_MODE } from "@/lib/demo-mode";
import type { PaymentEnvironment } from "@/features/provider-credentials/provider-credentials-client";
import { getMockBankTransfer } from "./bank-transfer.service";

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
  qrPayload?: string;
  expiresAt?: string;
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

const mockQrPayments = new Map<string, PaymentDetail>();

function requireMockQrPayment(paymentId: string) {
  const payment = mockQrPayments.get(paymentId);
  if (!payment) {
    throw new Error('No se encontró el pago QR de prueba. Genera un nuevo código.');
  }
  return payment;
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

    if (SPRINT1_DEMO_MODE) {
      const id = `qr_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString();
      const amount = Number(data.amount.toFixed(2));
      const qrPayload = `FROGPAY-SANDBOX|${id}|${data.currency}|${amount.toFixed(2)}`;

      mockQrPayments.set(id, {
        id,
        amount,
        currency: data.currency,
        fee: 0,
        net: amount,
        paymentMethod: 'qr',
        environment: 'sandbox',
        merchantReference: `DASH-QR-${data.idempotencyKey}`,
        status: 'PENDING',
        errorCode: null,
        createdAt: createdAt.toLocaleString('es-BO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        qrPayload,
        expiresAt,
        timeline: [{
          status: 'pending',
          timestamp: createdAt.toLocaleTimeString('es-BO'),
          isCurrent: true,
        }],
      });

      return {
        id,
        status: 'pending',
        amount: amount.toFixed(2),
        currency: data.currency,
        paymentMethod: 'qr',
        environment: 'sandbox',
        merchantReference: `DASH-QR-${data.idempotencyKey}`,
        commissionAmount: '0.00',
        netAmount: amount.toFixed(2),
        providerTransactionId: null,
        errorCode: null,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        qrPayload,
        expiresAt,
      };
    }

    return apiRequest<QrPaymentResponse>('/v1/payments', {
      method: 'POST',
      headers: { 'Idempotency-Key': data.idempotencyKey },
      body: JSON.stringify({
        amount: data.amount.toFixed(2),
        currency: data.currency,
        method: 'qr',
        merchantReference: `DASH-QR-${data.idempotencyKey}`,
      }),
    });
  },

  // Simulación de Pago QR en Sandbox (TSK-DEV1-302)
  simulateQrPayment: async (
    paymentId: string,
    result: 'APPROVED' | 'FAILED',
  ): Promise<void> => {
    if (SPRINT1_DEMO_MODE) {
      const payment = requireMockQrPayment(paymentId);
      const status = result === 'APPROVED' ? 'APPROVED' : 'FAILED';
      mockQrPayments.set(paymentId, {
        ...payment,
        status,
        timeline: [
          ...payment.timeline.map((event) => ({ ...event, isCurrent: false })),
          { status: status.toLowerCase(), timestamp: new Date().toLocaleTimeString('es-BO'), isCurrent: true },
        ],
      });
      return;
    }

    return apiRequest<void>(`/dashboard/payments/${encodeURIComponent(paymentId)}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ result }),
    });
  },

  expireMockQrPayment: async (paymentId: string): Promise<void> => {
    if (!SPRINT1_DEMO_MODE) return;

    const payment = requireMockQrPayment(paymentId);
    mockQrPayments.set(paymentId, {
      ...payment,
      status: 'EXPIRED',
      timeline: [
        ...payment.timeline.map((event) => ({ ...event, isCurrent: false })),
        { status: 'expired', timestamp: new Date().toLocaleTimeString('es-BO'), isCurrent: true },
      ],
    });
  },

  // Obtener Detalle de Pago por ID (Compatible con Tarjeta y QR)
  getPaymentById: async (id: string): Promise<PaymentDetail> => {
    if (SPRINT1_DEMO_MODE && mockQrPayments.has(id)) {
      return requireMockQrPayment(id);
    }
    const mockTransfer = getMockBankTransfer(id);
    if (mockTransfer) {
      const status = mockTransfer.status.toUpperCase() as PaymentStatus;
      return {
        id: mockTransfer.id,
        amount: Number(mockTransfer.amount),
        currency: mockTransfer.currency,
        fee: 0,
        net: Number(mockTransfer.amount),
        paymentMethod: mockTransfer.paymentMethod,
        environment: mockTransfer.environment,
        merchantReference: mockTransfer.merchantReference,
        status,
        errorCode: null,
        createdAt: new Date(mockTransfer.createdAt).toLocaleString('es-BO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        timeline: [{
          status: mockTransfer.status,
          timestamp: new Date(mockTransfer.createdAt).toLocaleTimeString('es-BO'),
          isCurrent: true,
        }],
      };
    }

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