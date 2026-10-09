/**
 * Puerto de salida hacia un proveedor de pagos.
 *
 * `modules/payments` depende de este contrato y no de un SDK de proveedor.
 * Cada adaptador implementa las operaciones necesarias para autorizar, capturar
 * y consultar el estado de una transacción.
 */
export const PAYMENT_PROVIDER_PORT = Symbol('PAYMENT_PROVIDER_PORT');

export type ProviderProcessingMode = 'synchronous' | 'asynchronous';

export interface ProviderFeeStructure {
  fixedAmount: string;
  variableBps: number;
  currency: string;
}

export interface PaymentMethodCapability {
  code: string;
  label: string;
  processingMode: ProviderProcessingMode;
  requiresPaymentToken: boolean;
  fees: ProviderFeeStructure;
}

export interface ProviderMetadata {
  id: string;
  displayName: string;
  methods: readonly PaymentMethodCapability[];
}

/** Datos validados por la capa HTTP antes de solicitar la autorización. */
export interface AuthorizeInput {
  /** Monto decimal como cadena, por ejemplo `"150.00"`. */
  amount: string;
  /** Código ISO 4217, por ejemplo `"BOB"`. */
  currency: string;
  /** Token de pago opaco generado por el frontend; nunca datos de tarjeta. */
  paymentToken: string;
  /** Clave enviada también al proveedor para evitar cobros duplicados. */
  idempotencyKey: string;
}

export interface CaptureInput {
  providerTransactionId: string;
}

export interface QueryStatusInput {
  providerTransactionId: string;
}

export type ProviderOutcome = 'approved' | 'declined' | 'timeout' | 'error';

export type PaymentProviderErrorCode =
  | 'card_declined'
  | 'insufficient_funds'
  | 'expired_card'
  | 'incorrect_cvc'
  | 'processing_error'
  | 'provider_timeout'
  | 'provider_unavailable';

export interface ProviderResult {
  outcome: ProviderOutcome;
  providerTransactionId?: string;
  errorCode?: PaymentProviderErrorCode;
}

export interface PaymentProviderPort {
  readonly metadata: ProviderMetadata;
  authorize(input: AuthorizeInput): Promise<ProviderResult>;
  capture(input: CaptureInput): Promise<ProviderResult>;
  queryStatus(input: QueryStatusInput): Promise<ProviderResult>;
}
