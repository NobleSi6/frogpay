/**
 * Puerto de salida hacia un proveedor de pagos.
 *
 * Es la frontera que `modules/payments` conoce: no sabe nada del SDK del
 * proveedor, ni de su versión, ni de sus códigos de error. Cada proveedor
 * (Stripe, QR BCB, ...) implementa esta interfaz en su propia carpeta dentro de
 * `provider-adapters/adapters/` (Adapter + Strategy, RF-16 / RNF-07).
 */
export const PAYMENT_PROVIDER_PORT = Symbol('PAYMENT_PROVIDER_PORT');

export interface AuthorizeInput {
  /** Montodecimal como cadena, por ejemplo `"150.00"`. */
  amount: string;
  /** Código ISO 4217 en minúsculas o mayúsculas, por ejemplo `"BOB"`. */
  currency: string;
  /** Token de pago opaco generado por el frontend. Nunca un número de tarjeta. */
  paymentToken: string;
  /**
   * Clave de idempotencia del pago. Debe viajar hasta el proveedor como clave
   * de idempotencia nativa: sin esto, un reintento puede duplicar el cobro.
   */
  idempotencyKey: string;
}

export interface CaptureInput {
  /** Identificador de la transacción en el proveedor (`pi_...` en Stripe). */
  providerTransactionId: string;
}

export interface QueryStatusInput {
  /** Identificador de la transacción en el proveedor (`pi_...` en Stripe). */
  providerTransactionId: string;
}

export type ProviderOutcome = 'approved' | 'declined' | 'timeout' | 'error';

export interface ProviderResult {
  outcome: ProviderOutcome;
  providerTransactionId?: string;
  errorCode?: string;
}

export interface PaymentProviderPort {
  authorize(input: AuthorizeInput): Promise<ProviderResult>;
  capture(input: CaptureInput): Promise<ProviderResult>;
  queryStatus(input: QueryStatusInput): Promise<ProviderResult>;
}