import { apiRequest } from "@/lib/api-client";

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  paymentMethodId: string;
}

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
  environment: string;
  merchantReference: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  rejectionReason: string | null;
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

    const idempotencyKey = crypto.randomUUID();
    return apiRequest<PaymentResponse>('/dashboard/payments/test', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        amount: data.amount.toFixed(2),
        currency: data.currency,
        paymentMethod: 'card',
        merchantReference: `DASH-${idempotencyKey}`,
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
    const status = payment.status.toUpperCase();
    const rejectionReason = getPaymentErrorMessage(payment.errorCode);

    return {
      id: payment.id,
      amount,
      currency: payment.currency,
      fee,
      net: Number(payment.netAmount ?? amount - fee),
      paymentMethod: payment.paymentMethod,
      environment: payment.environment,
      merchantReference: payment.merchantReference,
      status: status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING',
      rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      createdAt: new Date(payment.createdAt).toLocaleString('es-BO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      timeline: payment.statusHistory.map((event, index) => ({
        status: event.newStatus,
        timestamp: new Date(event.createdAt).toLocaleTimeString('es-BO'),
        isCurrent: index === payment.statusHistory.length - 1,
      })),
    };
  },
};

function getPaymentErrorMessage(errorCode: string | null): string {
  switch (errorCode) {
    case 'insufficient_funds':
      return 'La tarjeta no tiene fondos suficientes. Prueba con otra tarjeta o consulta con tu banco.';
    case 'expired_card':
      return 'La tarjeta está vencida. Revisa la fecha de vencimiento o usa otra tarjeta.';
    case 'incorrect_cvc':
      return 'El código de seguridad de la tarjeta es incorrecto. Verifícalo e inténtalo de nuevo.';
    case 'card_declined':
      return 'El banco emisor rechazó la tarjeta. Contacta con tu banco o prueba otro método de pago.';
    case 'processing_error':
      return 'Ocurrió un error al procesar el pago. Inténtalo de nuevo más tarde.';
    case 'provider_timeout':
      return 'El proveedor de pagos no respondió a tiempo. Verifica el estado del pago antes de volver a intentarlo.';
    case 'provider_unavailable':
      return 'El proveedor de pagos no está disponible temporalmente. Inténtalo de nuevo más tarde.';
    default:
      return 'El banco emisor rechazó la tarjeta. Contacta con tu banco para conocer más detalles.';
  }
}