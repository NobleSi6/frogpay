import { validateEnvironment } from './env.validation';

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
      JWT_SECRET: 'test-secret-with-at-least-32-characters',
      PRISMA_TX_TIMEOUT_MS: '5000',
      PRISMA_TX_MAX_WAIT_MS: '2000',
    });

    expect(environment.PRISMA_TX_TIMEOUT_MS).toBe(5000);
    expect(typeof environment.PRISMA_TX_TIMEOUT_MS).toBe('number');
    expect(environment.PRISMA_TX_MAX_WAIT_MS).toBe(2000);
    expect(typeof environment.PRISMA_TX_MAX_WAIT_MS).toBe('number');
  });

  it('defaults the mock adapter flag to false and validates explicit values', () => {
    const values = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/test',
      JWT_SECRET: 'test-secret-with-at-least-32-characters',
    };

    expect(validateEnvironment(values).PAYMENT_MOCK_ADAPTER_ENABLED).toBe('false');
    expect(validateEnvironment({
      ...values,
      PAYMENT_MOCK_ADAPTER_ENABLED: 'true',
    }).PAYMENT_MOCK_ADAPTER_ENABLED).toBe('true');
    expect(() => validateEnvironment({
      ...values,
      PAYMENT_MOCK_ADAPTER_ENABLED: 'yes',
    })).toThrow('PAYMENT_MOCK_ADAPTER_ENABLED debe ser true o false.');
  });

  it('requires a 32-byte hexadecimal encryption key in production', () => {
    const values = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/test',
      JWT_SECRET: 'test-secret-with-at-least-32-characters',
    };

    expect(() => validateEnvironment(values)).toThrow(
      'CREDENTIALS_ENCRYPTION_KEY es obligatoria en producción.',
    );
    expect(() => validateEnvironment({
      ...values,
      CREDENTIALS_ENCRYPTION_KEY: 'a'.repeat(64),
    })).not.toThrow();
    expect(() => validateEnvironment({
      ...values,
      CREDENTIALS_ENCRYPTION_KEY: 'not-a-key',
    })).toThrow('CREDENTIALS_ENCRYPTION_KEY debe contener 64 caracteres hexadecimales');
  });
});
