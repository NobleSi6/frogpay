import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import * as Stripe from 'stripe';
import { createStripeClient } from './stripe-client.provider';
import { resolveStripeProviderConfig } from './stripe-provider.config';
import { isTimeoutError, mapStripeErrorToResult } from './stripe-error.mapper';
import { AdapterErrorCode } from './stripe-payment-intent.mapper';
import { StripePaymentProviderAdapter } from './stripe-payment-provider.adapter';

/**
 * Timeout duro (DEV3-203).
 *
 * No es un mock del SDK: se levanta un servidor HTTP real que acepta la
 * conexión y nunca responde, y se apunta el cliente real de Stripe contra él.
 * Lo que se mide es el mecanismo de timeout del adapter de punta a punta.
 *
 * Esta prueba no necesita STRIPE_SECRET_KEY porque la petición nunca sale a
 * internet, pero sí usa el presupuesto de producción de 3000 ms.
 */
/** Presupuesto de producción. Las pruebas usan el mismo valor, no uno reducido. */
const TIMEOUT_MS = 3000;
/** Tolerancia para la latencia de la máquina, no para el presupuesto. */
const MARGIN_MS = 700;

describe('StripePaymentProviderAdapter - timeout duro', () => {
  let silentServer: Server;
  let adapter: StripePaymentProviderAdapter;

  beforeAll(async () => {
    silentServer = createServer(() => {
      // Acepta la conexión y no responde nunca. El socket queda abierto.
    });

    await new Promise<void>((resolve) => silentServer.listen(0, '127.0.0.1', resolve));
    const { port } = silentServer.address() as AddressInfo;

    const config = resolveStripeProviderConfig({
      // Clave con formato válido; la petición jamás sale hacia Stripe.
      STRIPE_SECRET_KEY: 'sk_test_timeoutHarnessOnly000000000',
      STRIPE_API_HOST: '127.0.0.1',
      STRIPE_API_PORT: String(port),
      STRIPE_API_PROTOCOL: 'http',
    });
    expect(config.timeoutMs).toBe(TIMEOUT_MS);

    adapter = new StripePaymentProviderAdapter(createStripeClient(config), config);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => silentServer.close(() => resolve()));
  });

  it('authorize() devuelve outcome "timeout" dentro de los 3000 ms', async () => {
    const startedAt = Date.now();

    const result = await adapter.authorize({
      amount: '25.00',
      currency: 'BOB',
      paymentToken: 'pm_card_visa',
      idempotencyKey: `timeout-${randomUUID()}`,
    });

    const elapsed = Date.now() - startedAt;

    expect(result.outcome).toBe('timeout');
    expect(result.errorCode).toBe('provider_timeout');
    // Tiene que haber agotado el presupuesto, no fallado antes de tiempo.
    expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 100);
    expect(elapsed).toBeLessThan(TIMEOUT_MS + MARGIN_MS);
  });

  it('queryStatus() devuelve outcome "timeout" dentro de los 3000 ms', async () => {
    const startedAt = Date.now();

    const result = await adapter.queryStatus({ providerTransactionId: 'pi_timeout_probe' });
    const elapsed = Date.now() - startedAt;

    expect(result.outcome).toBe('timeout');
    expect(result.errorCode).toBe('provider_timeout');
    expect(elapsed).toBeLessThan(TIMEOUT_MS + MARGIN_MS);
  });

  it('capture() devuelve outcome "timeout" dentro de los 3000 ms', async () => {
    const startedAt = Date.now();

    const result = await adapter.capture({ providerTransactionId: 'pi_timeout_probe' });
    const elapsed = Date.now() - startedAt;

    expect(result.outcome).toBe('timeout');
    expect(result.errorCode).toBe('provider_timeout');
    expect(elapsed).toBeLessThan(TIMEOUT_MS + MARGIN_MS);
  });

  it('nunca lanza una excepción hacia payments', async () => {
    await expect(
      adapter.authorize({
        amount: '25.00',
        currency: 'BOB',
        paymentToken: 'pm_card_visa',
        idempotencyKey: `timeout-throw-${randomUUID()}`,
      }),
    ).resolves.toBeDefined();
  });
});

/**
 * El timeout nativo del SDK es el mecanismo primario. Estos tests lo ejercitan
 * sin el reloj de pared del adapter, para que una regresión en la opción
 * `{ timeout }` no quede oculta detrás del reloj.
 */
describe('timeout nativo del SDK de Stripe', () => {
  let silentServer: Server;
  let unreachablePort: number;

  beforeAll(async () => {
    silentServer = createServer(() => {});
    await new Promise<void>((resolve) => silentServer.listen(0, '127.0.0.1', resolve));
    unreachablePort = (silentServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => silentServer.close(() => resolve()));
  });

  it('el SDK aborta la request con StripeConnectionError y detalle ETIMEDOUT', async () => {
    const config = resolveStripeProviderConfig({
      STRIPE_SECRET_KEY: 'sk_test_nativeTimeoutHarnessOnly00000',
      STRIPE_API_HOST: '127.0.0.1',
      STRIPE_API_PORT: String(unreachablePort),
      STRIPE_API_PROTOCOL: 'http',
    });
    const stripe = createStripeClient(config);

    const startedAt = Date.now();
    const error = await stripe.paymentIntents
      .create(
        { amount: 1000, currency: 'bob', payment_method: 'pm_x', confirm: true },
        { idempotencyKey: `native-${randomUUID()}`, timeout: TIMEOUT_MS, maxNetworkRetries: 0 },
      )
      .then(() => undefined)
      .catch((caught: unknown) => caught);
    const elapsed = Date.now() - startedAt;

    expect(error).toBeInstanceOf(Stripe.errors.StripeConnectionError);
    expect((error as { detail?: { code?: string } }).detail?.code).toBe('ETIMEDOUT');
    expect((error as Error).message).toContain('timeout');
    expect(elapsed).toBeLessThan(TIMEOUT_MS + MARGIN_MS);
  });

  it('el mapper traduce el error nativo del SDK a outcome "timeout"', () => {
    const nativeError = new Stripe.errors.StripeConnectionError({
      message: 'Request aborted due to timeout being reached (3000ms)',
      detail: Object.assign(new Error('socket'), { code: 'ETIMEDOUT' }),
    });

    expect(isTimeoutError(nativeError)).toBe(true);
    expect(mapStripeErrorToResult(nativeError)).toEqual({
      outcome: 'timeout',
      errorCode: AdapterErrorCode.PROVIDER_TIMEOUT,
    });
  });

  it('un Stripe inalcanzable es "error", no "timeout"', async () => {
    // Puerto cerrado: la conexión falla de inmediato, sin agotar presupuesto.
    const closedPort = await findClosedPort();
    const config = resolveStripeProviderConfig({
      STRIPE_SECRET_KEY: 'sk_test_unreachableHarnessOnly000000',
      STRIPE_API_HOST: '127.0.0.1',
      STRIPE_API_PORT: String(closedPort),
      STRIPE_API_PROTOCOL: 'http',
    });
    const adapterOffline = new StripePaymentProviderAdapter(createStripeClient(config), config);

    const startedAt = Date.now();
    const result = await adapterOffline.authorize({
      amount: '25.00',
      currency: 'BOB',
      paymentToken: 'pm_card_visa',
      idempotencyKey: `unreachable-${randomUUID()}`,
    });
    const elapsed = Date.now() - startedAt;

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBe('provider_unavailable');
    expect(result.outcome).not.toBe('timeout');
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
  });
});

/** Reserva un puerto y lo libera, para obtener uno sin nadie escuchando. */
async function findClosedPort(): Promise<number> {
  const probe = createServer(() => {});
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}