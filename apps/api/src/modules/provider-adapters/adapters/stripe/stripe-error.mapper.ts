import * as Stripe from 'stripe';
import { ProviderResult } from '../../ports/payment-provider.port';
import { AdapterErrorCode, toCatalogDeclineErrorCode } from './stripe-payment-intent.mapper';

/**
 * Señal interna de que el reloj de pared del adapter se agotó antes de que
 * terminara la llamada. No es un error de Stripe: es una decisión del adapter.
 */
export class StripeRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`La llamada a Stripe excedió el presupuesto de ${timeoutMs} ms.`);
    this.name = StripeRequestTimeoutError.name;
  }
}

const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof StripeRequestTimeoutError) return true;

  if (error instanceof Stripe.errors.StripeConnectionError) {
    const detail = (error as { detail?: { code?: string } }).detail;
    if (detail?.code === TIMEOUT_ERROR_CODE) return true;
    return typeof error.message === 'string' && /timeout/i.test(error.message);
  }

  if (error instanceof Error) {
    return (error as { code?: string }).code === TIMEOUT_ERROR_CODE;
  }

  return false;
}

/**
 * Traduce cualquier excepción del SDK a un resultado del puerto. El adapter
 * nunca propaga excepciones hacia `payments`: un fallo del proveedor es un
 * resultado, no un crash.
 */
export function mapStripeErrorToResult(error: unknown): ProviderResult {
  if (isTimeoutError(error)) {
    return { outcome: 'timeout', errorCode: AdapterErrorCode.PROVIDER_TIMEOUT };
  }

  if (error instanceof Stripe.errors.StripeCardError) {
    return {
      outcome: 'declined',
      errorCode: toCatalogDeclineErrorCode(error.decline_code ?? error.code),
    };
  }

  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    return { outcome: 'error', errorCode: AdapterErrorCode.PROVIDER_UNAVAILABLE };
  }

  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    return { outcome: 'error', errorCode: AdapterErrorCode.PROVIDER_UNAVAILABLE };
  }

  if (error instanceof Stripe.errors.StripePermissionError) {
    return { outcome: 'error', errorCode: AdapterErrorCode.PROVIDER_UNAVAILABLE };
  }

  if (error instanceof Stripe.errors.StripeRateLimitError) {
    return { outcome: 'error', errorCode: AdapterErrorCode.PROVIDER_UNAVAILABLE };
  }

  if (error instanceof Stripe.errors.StripeError) {
    return { outcome: 'error', errorCode: AdapterErrorCode.PROVIDER_UNAVAILABLE };
  }

  return { outcome: 'error', errorCode: AdapterErrorCode.PROVIDER_UNAVAILABLE };
}