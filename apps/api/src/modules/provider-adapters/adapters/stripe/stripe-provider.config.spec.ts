import {
  DEFAULT_STRIPE_TIMEOUT_MS,
  resolveStripeProviderConfig,
  StripeConfigurationError,
} from './stripe-provider.config';

const VALID_KEY = 'sk_test_51H8FakeKeyForUnitTestsOnly0000';

describe('resolveStripeProviderConfig', () => {
  it('falla al arrancar cuando STRIPE_SECRET_KEY no está definida', () => {
    expect(() => resolveStripeProviderConfig({})).toThrow(StripeConfigurationError);
    expect(() => resolveStripeProviderConfig({})).toThrow('STRIPE_SECRET_KEY es obligatoria');
    expect(() => resolveStripeProviderConfig({ STRIPE_SECRET_KEY: '   ' })).toThrow(
      StripeConfigurationError,
    );
  });

  it('rechaza una clave con formato inválido', () => {
    expect(() => resolveStripeProviderConfig({ STRIPE_SECRET_KEY: 'not-a-stripe-key' })).toThrow(
      'STRIPE_SECRET_KEY tiene un formato inválido',
    );
  });

  it('acepta claves sk_ y rk_', () => {
    expect(resolveStripeProviderConfig({ STRIPE_SECRET_KEY: VALID_KEY }).secretKey).toBe(VALID_KEY);
    expect(
      resolveStripeProviderConfig({ STRIPE_SECRET_KEY: 'rk_test_abc123' }).secretKey,
    ).toBe('rk_test_abc123');
  });

  it('aplica el presupuesto duro de 3000 ms por defecto', () => {
    const config = resolveStripeProviderConfig({ STRIPE_SECRET_KEY: VALID_KEY });
    expect(config.timeoutMs).toBe(3000);
    expect(DEFAULT_STRIPE_TIMEOUT_MS).toBe(3000);
  });

  it('desactiva los reintentos del SDK para que el timeout sea el techo real', () => {
    const config = resolveStripeProviderConfig({ STRIPE_SECRET_KEY: VALID_KEY });
    // El SDK reintenta 2 veces por defecto: 3 x 3000 ms superarían el presupuesto.
    expect(config.maxNetworkRetries).toBe(0);
  });

  it('rechaza valores no numéricos o no positivos', () => {
    expect(() =>
      resolveStripeProviderConfig({ STRIPE_SECRET_KEY: VALID_KEY, STRIPE_TIMEOUT_MS: '0' }),
    ).toThrow('STRIPE_TIMEOUT_MS debe ser un entero mayor que cero.');
    expect(() =>
      resolveStripeProviderConfig({ STRIPE_SECRET_KEY: VALID_KEY, STRIPE_TIMEOUT_MS: '3000.5' }),
    ).toThrow(StripeConfigurationError);
  });

  it('no restringe el host de la API en producción', () => {
    const config = resolveStripeProviderConfig({ STRIPE_SECRET_KEY: VALID_KEY });
    expect(config.host).toBeUndefined();
    expect(config.port).toBeUndefined();
    expect(config.protocol).toBeUndefined();
  });

  it('permite apuntar a un host alterno para pruebas', () => {
    const config = resolveStripeProviderConfig({
      STRIPE_SECRET_KEY: VALID_KEY,
      STRIPE_API_HOST: '127.0.0.1',
      STRIPE_API_PORT: '4010',
      STRIPE_API_PROTOCOL: 'http',
    });
    expect(config).toMatchObject({ host: '127.0.0.1', port: '4010', protocol: 'http' });
  });
});