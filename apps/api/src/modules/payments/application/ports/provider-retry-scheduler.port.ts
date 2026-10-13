/**
 * Reintentos de pagos asíncronos (QR) cuando el proveedor no está disponible
 * (TSK-DEV2-305). Pagos depende de este puerto; la cola concreta vive en infraestructura.
 */
export const PROVIDER_RETRY_SCHEDULER = Symbol('PROVIDER_RETRY_SCHEDULER');

export interface ProviderRetryMessage {
  paymentId: string;
  tenantId: string;
  paymentMethod: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  /** Intento de autorización que se va a ejecutar (el intento 1 fue la llamada original). */
  attempt: number;
}

export interface ProviderRetryScheduler {
  /** Retrasos configurados entre intentos (backoff exponencial). */
  readonly delaysMs: readonly number[];
  /** Programa el siguiente intento; `delayMs` debe ser uno de los retrasos configurados. */
  schedule(message: ProviderRetryMessage, delayMs: number): Promise<void>;
  /** Envía a la DLQ de pagos un pago cuyos reintentos se agotaron. */
  deadLetter(message: ProviderRetryMessage & { reason: string; failedAt: string }): Promise<void>;
}

/** Errores del proveedor que justifican reintentar un pago asíncrono. */
export const RETRYABLE_PROVIDER_ERRORS: readonly string[] = ['provider_unavailable', 'provider_timeout'];

export const DEFAULT_PROVIDER_RETRY_DELAYS_MS: readonly number[] = [5000, 10000, 20000, 40000, 80000];

/** Lee PROVIDER_RETRY_DELAYS_MS ("5000,10000,..."); si es inválido usa los valores por defecto. */
export function parseRetryDelays(raw: string | undefined): number[] {
  if (!raw?.trim()) return [...DEFAULT_PROVIDER_RETRY_DELAYS_MS];
  const values = raw.split(',').map((v) => Number(v.trim()));
  return values.length > 0 && values.every((v) => Number.isInteger(v) && v > 0)
    ? values
    : [...DEFAULT_PROVIDER_RETRY_DELAYS_MS];
}
