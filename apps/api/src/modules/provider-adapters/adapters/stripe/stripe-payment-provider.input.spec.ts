import { InvalidStripeAmountError } from './stripe-amount';
import { createStripeClient } from './stripe-client.provider';
import { resolveStripeProviderConfig } from './stripe-provider.config';
import { StripePaymentProviderAdapter } from './stripe-payment-provider.adapter';

describe('StripePaymentProviderAdapter input validation boundary', () => {
  it('propagates invalid amount input instead of creating a failed payment result', async () => {
    const config = resolveStripeProviderConfig({
      STRIPE_SECRET_KEY: 'sk_test_invalidAmountHarnessOnly00000',
    });
    const adapter = new StripePaymentProviderAdapter(createStripeClient(config), config);

    await expect(
      adapter.authorize({
        amount: 'not-an-amount',
        currency: 'BOB',
        paymentToken: 'pm_card_visa',
        idempotencyKey: 'invalid-amount-test',
      }),
    ).rejects.toBeInstanceOf(InvalidStripeAmountError);
  });
});
