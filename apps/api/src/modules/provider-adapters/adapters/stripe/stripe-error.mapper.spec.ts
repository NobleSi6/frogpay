import * as Stripe from 'stripe';
import { ERROR_CATALOG } from '../../../../shared/http/errors/error-catalog';
import { mapStripeErrorToResult } from './stripe-error.mapper';

describe('mapStripeErrorToResult', () => {
  it.each([
    new Stripe.errors.StripeInvalidRequestError({
      message: 'invalid request detail',
      type: 'invalid_request_error',
      code: 'stripe_invalid_request',
    } as never),
    new Stripe.errors.StripeAuthenticationError({
      message: 'authentication detail',
      type: 'authentication_error',
      code: 'stripe_authentication',
    } as never),
    new Stripe.errors.StripePermissionError({
      message: 'permission detail',
      type: 'permission_error',
      code: 'stripe_permission',
    } as never),
    new Stripe.errors.StripeRateLimitError({
      message: 'rate limit detail',
      type: 'rate_limit_error',
      code: 'stripe_rate_limit',
    } as never),
    new Stripe.errors.StripeAPIError({
      message: 'generic Stripe detail',
      type: 'api_error',
      code: 'stripe_api_error',
    } as never),
    Object.assign(new Error('network failure'), { code: 'ECONNRESET' }),
    new Error('unknown failure'),
  ])('maps infrastructure errors to provider_unavailable without Stripe detail', (error) => {
    expect(mapStripeErrorToResult(error)).toEqual({
      outcome: 'error',
      errorCode: ERROR_CATALOG.provider_unavailable.code,
    });
  });

  it.each([
    ['card_declined', ERROR_CATALOG.card_declined.code],
    ['insufficient_funds', ERROR_CATALOG.insufficient_funds.code],
    ['expired_card', ERROR_CATALOG.expired_card.code],
    ['incorrect_cvc', ERROR_CATALOG.incorrect_cvc.code],
    ['do_not_honor', ERROR_CATALOG.card_declined.code],
  ])('normalizes Stripe card decline %s to a catalog code', (declineCode, errorCode) => {
    const error = new Stripe.errors.StripeCardError({
      message: 'card declined',
      type: 'card_error',
      code: 'card_declined',
      decline_code: declineCode,
    } as never);

    expect(mapStripeErrorToResult(error)).toEqual({
      outcome: 'declined',
      errorCode,
    });
  });
});
