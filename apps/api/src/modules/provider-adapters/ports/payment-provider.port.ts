export interface ProcessPaymentCommand {
  tenantId: string;
  environment: 'sandbox' | 'production';
  amount: string;
  currency: string;
  paymentMethod: string;
  merchantReference: string;
  paymentToken?: string;
  idempotencyKey: string;
}

export interface ProcessPaymentResult {
  status: 'approved' | 'rejected' | 'failed';
  providerTransactionId?: string | null;
  errorCode?: string | null;
  rawResponse?: Record<string, unknown>;
}

export const PAYMENT_PROVIDER_PORT = Symbol('PAYMENT_PROVIDER_PORT');

export interface PaymentProviderPort {
  processPayment(command: ProcessPaymentCommand): Promise<ProcessPaymentResult>;
}
