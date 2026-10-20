import { sanitizeJson } from './audit.service';

describe('sanitizeJson', () => {
  it('redacta secretos en cualquier nivel antes de auditar', () => {
    expect(
      sanitizeJson({
        paymentId: 'p-1',
        credentials: {
          secretKey: 'sk_test_private',
          publishableKey: 'pk_test_public',
        },
        authorization: 'Bearer token',
        nested: [{ password: 'unsafe', state: 'approved' }],
      }),
    ).toEqual({
      paymentId: 'p-1',
      credentials: '[REDACTED]',
      authorization: '[REDACTED]',
      nested: [{ password: '[REDACTED]', state: 'approved' }],
    });
  });
});
