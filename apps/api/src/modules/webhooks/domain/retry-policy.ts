/**
 * Política de reintentos de webhooks (TSK-DEV2-302, ADR-006):
 * 1 intento inicial + 5 reintentos a 1, 2, 4, 8 y 16 segundos.
 */
export const WEBHOOK_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000];
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;

/**
 * Devuelve el retraso antes del siguiente intento, o null si ya no quedan
 * reintentos. `attemptNumber` es el intento que acaba de fallar (1 = inicial).
 */
export function nextRetryDelayMs(attemptNumber: number): number | null {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) return null;
  return WEBHOOK_RETRY_DELAYS_MS[attemptNumber - 1] ?? null;
}

/** Una respuesta 2xx es éxito; cualquier otro código, timeout o error de red es fallo. */
export function isSuccessfulStatus(status: number | null | undefined): boolean {
  return typeof status === 'number' && status >= 200 && status < 300;
}
