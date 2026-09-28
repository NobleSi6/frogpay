import { validateEnvironment } from './env.validation.js';

describe('validateEnvironment', () => {
  it('fails when DATABASE_URL is missing', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).toThrow(
      'DATABASE_URL es obligatoria.',
    );
  });

  it('converts transaction limits from environment strings to numbers', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/test',
      PRISMA_TX_TIMEOUT_MS: '5000',
      PRISMA_TX_MAX_WAIT_MS: '2000',
    });

    expect(environment.PRISMA_TX_TIMEOUT_MS).toBe(5000);
    expect(typeof environment.PRISMA_TX_TIMEOUT_MS).toBe('number');
    expect(environment.PRISMA_TX_MAX_WAIT_MS).toBe(2000);
    expect(typeof environment.PRISMA_TX_MAX_WAIT_MS).toBe('number');
  });
});