import type * as Stripe from 'stripe';
import { ProviderResult } from '../../ports/payment-provider.port';
import { ERROR_CATALOG } from '../../../../shared/http/errors/error-catalog';

/** Catálogo cerrado compartido por errores HTTP y resultados de pago. */
export const AdapterErrorCode = {
  VALIDATION_ERROR: ERROR_CATALOG.validation_error.code,
  IDEMPOTENCY_IN_PROGRESS: ERROR_CATALOG.idempotency_in_progress.code,
  IDEMPOTENCY_KEY_REUSED: ERROR_CATALOG.idempotency_key_reused.code,
  PLAN_LIMIT_EXCEEDED: ERROR_CATALOG.plan_limit_exceeded.code,
  CARD_DECLINED: ERROR_CATALOG.card_declined.code,
  INSUFFICIENT_FUNDS: ERROR_CATALOG.insufficient_funds.code,
  EXPIRED_CARD: ERROR_CATALOG.expired_card.code,
  INCORRECT_CVC: ERROR_CATALOG.incorrect_cvc.code,
  PROCESSING_ERROR: ERROR_CATALOG.processing_error.code,
  PROVIDER_TIMEOUT: ERROR_CATALOG.provider_timeout.code,
  PROVIDER_UNAVAILABLE: ERROR_CATALOG.provider_unavailable.code,
} as const;

/**
 * Traduce el estado de un PaymentIntent al resultado del puerto.
 *
 * El puerto tiene cuatro desenlaces, pero Stripe tiene varios estados. Los
 * estados de borde no esperados con confirmación automática se conservan solo
 * en los logs y se normalizan al código cerrado `processing_error`.
 */
export function mapPaymentIntentToResult(intent: Stripe.PaymentIntent): ProviderResult {
  switch (intent.status) {
    case 'succeeded':
      return { outcome: 'approved', providerTransactionId: intent.id };
    case 'requires_payment_method':
      return {
        outcome: 'declined',
        providerTransactionId: intent.id,
        errorCode: toCatalogDeclineErrorCode(extractIntentErrorCode(intent)),
      };
    case 'processing':
    case 'requires_action':
    case 'requires_confirmation':
    case 'requires_capture':
    case 'canceled':
      // Son estados de borde no esperados con confirmación automática; el detalle
      // de Stripe queda en logs, no se expone fuera del adapter.
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.PROCESSING_ERROR,
      };
    default:
      return {
        outcome: 'error',
        providerTransactionId: intent.id,
        errorCode: AdapterErrorCode.PROCESSING_ERROR,
      };
  }
}

export function toCatalogDeclineErrorCode(code: string | undefined): string {
  switch (code) {
    case ERROR_CATALOG.insufficient_funds.code:
    case ERROR_CATALOG.expired_card.code:
    case ERROR_CATALOG.incorrect_cvc.code:
    case ERROR_CATALOG.processing_error.code:
      return code;
    case ERROR_CATALOG.card_declined.code:
    case 'generic_decline':
    default:
      return ERROR_CATALOG.card_declined.code;
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