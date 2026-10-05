import { apiRequest } from "@/lib/api-client";

export interface CreatePaymentDTO {
  amount: number;
  currency: string;
  paymentMethodId: string;
}

export interface PaymentTimelineEvent {
  status: string;
  timestamp: string;
  isCurrent?: boolean;
}

export interface PaymentDetail {
  id: string;
  amount: number;
  currency: string;
  fee: number;
  net: number;
  paymentMethod: string;
  environment: string;
  merchantReference: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  createdAt: string;
  timeline: PaymentTimelineEvent[];
}

// Forzamos la constante en true para habilitar el modo Demo/Mock localmente
const SPRINT1_DEMO_MODE = true;

const mockPayments = new Map<string, PaymentDetail>();

function createMockPayment(data: CreatePaymentDTO): PaymentDetail {
  const isSuccess = data.paymentMethodId !== 'pm_card_chargeCustomerFail';
  const amount = Number(data.amount);
  const now = new Date();
  const payment: PaymentDetail = {
    id: `pay_${crypto.randomUUID()}`,
    amount,
    currency: data.currency,
    fee: Number((amount * 0.035).toFixed(2)),
    net: Number((amount * 0.965).toFixed(2)),
    paymentMethod: 'Tarjeta de prueba',
    environment: 'Sandbox',
    merchantReference: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
    status: isSuccess ? 'APPROVED' : 'REJECTED',
    createdAt: now.toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' }),
    timeline: [
      { status: 'Solicitud creada', timestamp: now.toLocaleTimeString('es-BO') },
      { status: 'Procesando en Stripe', timestamp: now.toLocaleTimeString('es-BO') },
      {
        status: isSuccess ? 'Pago approved' : 'Pago rechazado',
        timestamp: now.toLocaleTimeString('es-BO'),
        isCurrent: true,
      },
    ],
  };

  mockPayments.set(payment.id, payment);
  return payment;
}

export const paymentsService = {
  createPayment: async (data: CreatePaymentDTO, idempotencyKey: string): Promise<PaymentDetail> => {
    if (SPRINT1_DEMO_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return createMockPayment(data);
    }

    return apiRequest<PaymentDetail>('/dashboard/payments/test', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
  },

  getPaymentById: async (id: string): Promise<PaymentDetail> => {
    if (SPRINT1_DEMO_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const payment = mockPayments.get(id);
      if (!payment) throw new Error('No se encontró el pago de demostración solicitado.');
      return payment;
    }

    return apiRequest<PaymentDetail>(`/dashboard/payments/${encodeURIComponent(id)}`);
  },
};