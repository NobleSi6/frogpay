import { MockPaymentProviderAdapter } from './mock-payment-provider.adapter';

describe('MockPaymentProviderAdapter', () => {
  const adapter = new MockPaymentProviderAdapter();

  it('authorizes without requiring a payment token and uses the idempotency key', async () => {
    await expect(
      adapter.authorize({
        amount: '25.00',
        currency: 'BOB',
        paymentToken: '',
        idempotencyKey: 'mock-idempotency-key',
      }),
    ).resolves.toEqual({
      outcome: 'approved',
      providerTransactionId: 'mock_mock-idempotency-key',
    });
  });

  it('reports the method capability needed to bind the mock adapter', () => {
    expect(adapter.metadata.methods).toEqual([
      expect.objectContaining({
        code: 'card',
        processingMode: 'synchronous',
        requiresPaymentToken: false,
      }),
    ]);
  });

  it('returns the same local result for capture and status queries', async () => {
    await expect(adapter.capture({ providerTransactionId: 'mock-id' })).resolves.toEqual({
      outcome: 'approved',
      providerTransactionId: 'mock-id',
    });
    await expect(adapter.queryStatus({ providerTransactionId: 'mock-id' })).resolves.toEqual({
      outcome: 'approved',
      providerTransactionId: 'mock-id',
    });
  });
});
