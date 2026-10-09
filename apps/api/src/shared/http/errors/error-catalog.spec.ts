import { ERROR_CATALOG } from './error-catalog';

describe('ERROR_CATALOG', () => {
  it('contains exactly the eleven public catalog codes', () => {
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual(
      [
        'card_declined',
        'expired_card',
        'idempotency_in_progress',
        'idempotency_key_reused',
        'incorrect_cvc',
        'insufficient_funds',
        'plan_limit_exceeded',
        'processing_error',
        'provider_timeout',
        'provider_unavailable',
        'validation_error',
      ].sort(),
    );
  });

  it('assigns HTTP statuses only to request errors', () => {
    expect(ERROR_CATALOG.validation_error.httpStatus).toBe(422);
    expect(ERROR_CATALOG.idempotency_in_progress.httpStatus).toBe(409);
    expect(ERROR_CATALOG.idempotency_key_reused.httpStatus).toBe(422);
    expect(ERROR_CATALOG.plan_limit_exceeded.httpStatus).toBe(429);
    expect(ERROR_CATALOG.card_declined).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.insufficient_funds).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.expired_card).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.incorrect_cvc).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.processing_error).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.provider_timeout).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.provider_unavailable).not.toHaveProperty('httpStatus');
  });
});
