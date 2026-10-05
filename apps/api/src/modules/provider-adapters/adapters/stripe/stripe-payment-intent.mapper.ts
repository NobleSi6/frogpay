import type * as Stripe from 'stripe';
import { ProviderResult } from '../../ports/payment-provider.port';

/** Códigos propios del adaptador cuando Stripe no da uno utilizable. */
export const AdapterErrorCode = {
  TIMEOUT: 'provider_timeout',
  INVALID_AMOUNT: 'invalid_amount',
  REQUIRES_ACTION: 'requires_action',
  PROCESSING: 'processing',
  REQUIRES_CONFIRMATION: 'requires_confirmation',
  CANCELED: 'canceled',
  UNEXPECTED_ERROR: 'provider_error',
} as const;

/**
 * Traduce el estado de un PaymentIntent al resultado del puerto.
 *
 * El puerto tiene cuatro desenlaces, pero Stripe tiene ocho estados. Todo estado
 * no terminal se reporta como `error` con un `errorCode` específico para que
 * `payments` pueda decidir; solo `requires_payment_method` se traduce a
 * `declined`, porque significa que el emisor rechazó el instrumento.
 */
export function mapPaymentIntentToResult(intent: Stripe.PaymentIntent): ProviderResult {
  switch (intent.status) {
    case 'succeeded':
      return { outcome: 'approved', providerTransactionId: intent.id };
    case 'requires_payment_method':
      return {
        outcome: 'declined',
        providerTransactionId: intent.id,
        errorCode: extractIntentErrorCode(intent) ?? 'card_declined',
      };
    case 'processing':
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.PROCESSING,
      };
    case 'requires_action':
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.REQUIRES_ACTION,
      };
    case 'requires_confirmation':
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.REQUIRES_CONFIRMATION,
      };
    case 'requires_capture':
      // Solo alcanzable con captura manual; el adapter autoriza con captura
      // automática, así que se considera un estado inesperado.
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: 'requires_capture',
      };
    case 'canceled':
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.CANCELED,
      };
    default:
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.UNEXPECTED_ERROR,
      };
  }
}

function extractIntentErrorCode(intent: Stripe.PaymentIntent): string | undefined {
  const lastError = intent.last_payment_error;
  if (!lastError) return undefined;
  if ('code' in lastError && typeof lastError.code === 'string' && lastError.code) {
    return lastError.code;
  }
  if ('decline_code' in lastError && typeof lastError.decline_code === 'string') {
    return lastError.decline_code;
  }
  return lastError.type;
}