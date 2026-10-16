import { ERROR_CATALOG } from './error-catalog';

describe('ERROR_CATALOG', () => {
  it('contains exactly the public catalog codes', () => {
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual(
      [
        'card_declined',
        'deposit_id_reused',
        'expired_card',
        'idempotency_in_progress',
        'idempotency_key_reused',
        'incorrect_cvc',
        'insufficient_funds',
        'invalid_state_transition',
        'plan_limit_exceeded',
        'processing_error',
        'provider_timeout',
        'provider_unavailable',
        'qr_expired',
        'transfer_expired',
        'amount_mismatch',
        'currency_mismatch',
        'reference_not_found',
        'validation_error',
      ].sort(),
    );
  });

  it('assigns HTTP statuses only to request errors', () => {
    expect(ERROR_CATALOG.validation_error.httpStatus).toBe(422);
    expect(ERROR_CATALOG.idempotency_in_progress.httpStatus).toBe(409);
    expect(ERROR_CATALOG.idempotency_key_reused.httpStatus).toBe(422);
    expect(ERROR_CATALOG.deposit_id_reused.httpStatus).toBe(409);
    expect(ERROR_CATALOG.plan_limit_exceeded.httpStatus).toBe(429);
    expect(ERROR_CATALOG.card_declined).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.insufficient_funds).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.expired_card).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.incorrect_cvc).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.processing_error).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.provider_timeout).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.provider_unavailable).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.qr_expired).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.transfer_expired).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.amount_mismatch).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.currency_mismatch).not.toHaveProperty('httpStatus');
    expect(ERROR_CATALOG.reference_not_found).not.toHaveProperty('httpStatus');
  });

  it('incluye los códigos del Sprint 3: qr_expired e invalid_state_transition (TSK-DEV2-305)', () => {
    expect(ERROR_CATALOG.qr_expired).toEqual({ code: 'qr_expired', message: expect.any(String) });
    expect(ERROR_CATALOG.invalid_state_transition).toEqual({
      code: 'invalid_state_transition',
      httpStatus: 409,
      message: expect.any(String),
    });
  });
});
