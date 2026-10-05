import type Stripe from 'stripe';
import { ERROR_CATALOG } from '../../../../shared/http/errors/error-catalog';
import { AdapterErrorCode, mapPaymentIntentToResult } from './stripe-payment-intent.mapper';

function intent(status: Stripe.PaymentIntent.Status, overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return { id: 'pi_test_123', object: 'payment_intent', status, ...overrides } as Stripe.PaymentIntent;
}

describe('mapPaymentIntentToResult', () => {
  it('AdapterErrorCode contains exactly the closed catalog values', () => {
    expect(Object.values(AdapterErrorCode).sort()).toEqual(
      Object.values(ERROR_CATALOG)
        .map(({ code }) => code)
        .sort(),
    );
  });

  it('succeeded es el único estado approved', () => {
    expect(mapPaymentIntentToResult(intent('succeeded'))).toEqual({
      outcome: 'approved',
      providerTransactionId: 'pi_test_123',
    });
  });

  it('requires_payment_method es declined y arrastra el código del emisor', () => {
    const result = mapPaymentIntentToResult(
      intent('requires_payment_method', {
        last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds', type: 'card_error' } as never,
      }),
    );

    expect(result.outcome).toBe('declined');
    expect(result.errorCode).toBe('card_declined');
  });

  it('usa un decline_code del catálogo cuando no hay code', () => {
    const result = mapPaymentIntentToResult(
      intent('requires_payment_method', {
        last_payment_error: { decline_code: 'insufficient_funds', type: 'card_error' } as never,
      }),
    );

    expect(result.outcome).toBe('declined');
    expect(result.errorCode).toBe(ERROR_CATALOG.insufficient_funds.code);
  });

  it.each([
    ['card_declined', ERROR_CATALOG.card_declined.code],
    ['insufficient_funds', ERROR_CATALOG.insufficient_funds.code],
    ['expired_card', ERROR_CATALOG.expired_card.code],
    ['incorrect_cvc', ERROR_CATALOG.incorrect_cvc.code],
  ])('conserva el código de rechazo del catálogo %s', (code, expected) => {
    const result = mapPaymentIntentToResult(
      intent('requires_payment_method', {
        last_payment_error: { code, type: 'card_error' } as never,
      }),
    );

    expect(result.outcome).toBe('declined');
    expect(result.errorCode).toBe(expected);
  });

  it('normaliza un código de rechazo fuera del catálogo cerrado', () => {
    const result = mapPaymentIntentToResult(
      intent('requires_payment_method', {
        last_payment_error: { decline_code: 'do_not_honor', type: 'card_error' } as never,
      }),
    );

    expect(result.errorCode).toBe(ERROR_CATALOG.card_declined.code);
  });

  it('cae a card_declined si el emisor no envía código', () => {
    const result = mapPaymentIntentToResult(intent('requires_payment_method'));
    expect(result.outcome).toBe('declined');
    expect(result.errorCode).toBe('card_declined');
  });

  it.each([
    'processing',
    'requires_action',
    'requires_confirmation',
    'requires_capture',
    'canceled',
  ] as const)('%s es un error normalizado a processing_error', (status) => {
    const result = mapPaymentIntentToResult(intent(status));

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBe(AdapterErrorCode.PROCESSING_ERROR);
    expect(result.providerTransactionId).toBe('pi_test_123');
  });

  it('un estado desconocido no se Approved por accidente', () => {
    const result = mapPaymentIntentToResult(intent('estado_futuro' as Stripe.PaymentIntent.Status));

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBe(AdapterErrorCode.PROCESSING_ERROR);
  });
});