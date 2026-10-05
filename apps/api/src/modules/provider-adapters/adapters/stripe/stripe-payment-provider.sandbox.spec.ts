import { randomUUID } from 'node:crypto';
import type * as Stripe from 'stripe';
import { createStripeClient } from './stripe-client.provider';
import { resolveStripeProviderConfig } from './stripe-provider.config';
import { StripePaymentProviderAdapter } from './stripe-payment-provider.adapter';

/**
 * Pruebas contra el sandbox real de Stripe (DEV3-203). No son mocks: el SDK
 * habla con api.stripe.com y las tarjetas son las de prueba oficiales.
 *
 * Requiere STRIPE_SECRET_KEY en el entorno. Sin la clave la suite se salta y
 * avisa por consola, para que `npm test` no rompa a quien no la tiene.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm test -w apps/api
 *
 * El caso del timeout forzado vive en stripe-payment-provider.timeout.spec.ts,
 * porque no necesita la clave: usa el presupuesto real contra un servidor local
 * que no responde.
 */

const SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const describeStripeSandbox = SECRET_KEY ? describe : describe.skip;

/** 10.00 BOB = 1000 unidades menores. BOB tiene dos decimales. */
const AMOUNT = '10.00';
const CURRENCY = 'BOB';

/**
 * PaymentMethods de prueba oficiales de Stripe. No se puede pasar el numero de
 * tarjeta en crudo: la API de datos de tarjeta crudos esta deshabilitada en la
 * cuenta y Stripe responde "Sending credit card numbers directly to the Stripe
 * API is generally unsafe". Estos ids equivalen a las tarjetas de prueba:
 *   pm_card_visa            = 4242 4242 4242 4242 (aprueba)
 *   pm_card_chargeDeclined  = 4000 0000 0000 0002 (rechaza)
 */
const CARD_APPROVED = 'pm_card_visa';
const CARD_DECLINED = 'pm_card_chargeDeclined';

if (!SECRET_KEY) {
  console.warn(
    '[stripe.sandbox] STRIPE_SECRET_KEY no está definida: se saltan las pruebas contra el sandbox de Stripe.',
  );
}

describeStripeSandbox('StripePaymentProviderAdapter - sandbox real de Stripe', () => {
  let stripe: Stripe;
  let adapter: StripePaymentProviderAdapter;

  beforeAll(() => {
    const config = resolveStripeProviderConfig({
      STRIPE_SECRET_KEY: SECRET_KEY,
      STRIPE_TIMEOUT_MS: process.env.STRIPE_TIMEOUT_MS,
      STRIPE_MAX_NETWORK_RETRIES: process.env.STRIPE_MAX_NETWORK_RETRIES,
    });
    stripe = createStripeClient(config);
    adapter = new StripePaymentProviderAdapter(stripe, config);
  });

  it('4242 4242 4242 4242 devuelve outcome "approved"', async () => {
    const result = await adapter.authorize({
      amount: AMOUNT,
      currency: CURRENCY,
      paymentToken: CARD_APPROVED,
      idempotencyKey: `approved-${randomUUID()}`,
    });

    expect(result.outcome).toBe('approved');
    expect(result.providerTransactionId).toMatch(/^pi_/);
    expect(result.errorCode).toBeUndefined();
  });

  it('4000 0000 0000 0002 devuelve outcome "declined"', async () => {
    const result = await adapter.authorize({
      amount: AMOUNT,
      currency: CURRENCY,
      paymentToken: CARD_DECLINED,
      idempotencyKey: `declined-${randomUUID()}`,
    });

    expect(result.outcome).toBe('declined');
    expect(result.providerTransactionId).toBeUndefined();
    expect(result.errorCode).toBeDefined();
  });

  it('acepta BOB: el sandbox lo acepta como moneda presentment', async () => {
    const result = await adapter.authorize({
      amount: AMOUNT,
      currency: CURRENCY,
      paymentToken: CARD_APPROVED,
      idempotencyKey: `bob-currency-${randomUUID()}`,
    });

    // Si Stripe rechazara BOB, el resultado sería 'error' con un código de
    // parámetro inválido, nunca 'approved'.
    expect(result.errorCode).toBeUndefined();
    expect(result.outcome).toBe('approved');
    expect(result.providerTransactionId).toMatch(/^pi_/);
  });

  it('la clave de idempotencia nativa evita duplicar el cobro en un reintento', async () => {
    const paymentToken = CARD_APPROVED;
    const idempotencyKey = `idempotency-${randomUUID()}`;

    const first = await adapter.authorize({ amount: AMOUNT, currency: CURRENCY, paymentToken, idempotencyKey });
    const second = await adapter.authorize({ amount: AMOUNT, currency: CURRENCY, paymentToken, idempotencyKey });

    expect(first.outcome).toBe('approved');
    expect(second.outcome).toBe('approved');
    // Stripe devuelve el mismo PaymentIntent: no se creó un segundo cobro.
    expect(second.providerTransactionId).toBe(first.providerTransactionId);
  });

  it('capture() no ejecuta una segunda operación monetaria: solo recupera el estado', async () => {
    const authorized = await adapter.authorize({
      amount: AMOUNT,
      currency: CURRENCY,
      paymentToken: CARD_APPROVED,
      idempotencyKey: `capture-${randomUUID()}`,
    });
    expect(authorized.outcome).toBe('approved');
    expect(authorized.providerTransactionId).toMatch(/^pi_/);

    const captured = await adapter.capture({ providerTransactionId: authorized.providerTransactionId as string });
    const queried = await adapter.queryStatus({ providerTransactionId: authorized.providerTransactionId as string });

    expect(captured.outcome).toBe('approved');
    expect(captured.providerTransactionId).toBe(authorized.providerTransactionId);
    expect(queried.outcome).toBe('approved');
    expect(queried.providerTransactionId).toBe(authorized.providerTransactionId);
  });

  it('un token de pago inexistente produce error, no una excepción', async () => {
    const result = await adapter.authorize({
      amount: AMOUNT,
      currency: CURRENCY,
      paymentToken: 'pm_no_existe',
      idempotencyKey: `invalid-token-${randomUUID()}`,
    });

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBeDefined();
  });

  it('una clave de idempotencia que excede el límite de Stripe produce error', async () => {
    const result = await adapter.authorize({
      amount: AMOUNT,
      currency: CURRENCY,
      paymentToken: CARD_APPROVED,
      idempotencyKey: 'k'.repeat(300),
    });

    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBeDefined();
  });
});