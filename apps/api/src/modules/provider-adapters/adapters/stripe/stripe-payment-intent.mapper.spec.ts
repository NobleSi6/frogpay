import type Stripe from 'stripe';
import { AdapterErrorCode, mapPaymentIntentToResult } from './stripe-payment-intent.mapper';

function intent(status: Stripe.PaymentIntent.Status, overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return { id: 'pi_test_123', object: 'payment_intent', status, ...overrides } as Stripe.PaymentIntent;
}

describe('mapPaymentIntentToResult', () => {
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

  it('usa decline_code cuando no hay code', () => {
    const result = mapPaymentIntentToResult(
      intent('requires_payment_method', {
        last_payment_error: { decline_code: 'do_not_honor', type: 'card_error' } as never,
      }),
    );

    expect(result.outcome).toBe('declined');
    expect(result.errorCode).toBe('do_not_honor');
  });

  it('cae a card_declined si el emisor no envía código', () => {
    const result = mapPaymentIntentToResult(intent('requires_payment_method'));
    expect(result.outcome).toBe('declined');
    expect(result.errorCode).toBe('card_declined');
  });

  it.each([
    ['processing', AdapterErrorCode.PROCESSING],
    ['requires_action', AdapterErrorCode.REQUIRES_ACTION],
    ['requires_confirmation', AdapterErrorCode.REQUIRES_CONFIRMATION],
    ['requires_capture', 'requires_capture'],
    ['canceled', AdapterErrorCode.CANCELED],
  ] as const)('%s es error con un código propio, nunca approved ni declined', (status, errorCode) => {
    const result = mapPaymentIntentToResult(intent(status));

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBe(errorCode);
    expect(result.providerTransactionId).toBe('pi_test_123');
  });

  it('un estado desconocido no se Approved por accidente', () => {
    const result = mapPaymentIntentToResult(intent('estado_futuro' as Stripe.PaymentIntent.Status));

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBe(AdapterErrorCode.UNEXPECTED_ERROR);
  });
});