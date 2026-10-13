import { isSuccessfulStatus, nextRetryDelayMs, WEBHOOK_MAX_ATTEMPTS } from './retry-policy';

describe('Política de reintentos de webhooks', () => {
  it('programa 5 reintentos con retraso creciente 1-2-4-8-16 s', () => {
    expect([1, 2, 3, 4, 5].map(nextRetryDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('no hay más reintentos después del sexto intento', () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(6);
    expect(nextRetryDelayMs(6)).toBeNull();
    expect(nextRetryDelayMs(0)).toBeNull();
  });

  it('solo 2xx cuenta como éxito', () => {
    expect(isSuccessfulStatus(200)).toBe(true);
    expect(isSuccessfulStatus(204)).toBe(true);
    expect(isSuccessfulStatus(301)).toBe(false);
    expect(isSuccessfulStatus(500)).toBe(false);
    expect(isSuccessfulStatus(null)).toBe(false);
  });
});
