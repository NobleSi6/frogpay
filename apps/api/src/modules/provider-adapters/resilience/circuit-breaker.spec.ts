import { CircuitBreaker } from './circuit-breaker';
import { CircuitBreakerPaymentProvider } from './circuit-breaker-payment-provider';

const options = { failureRateThreshold: 0.5, windowMs: 60_000, minimumRequests: 5, openDurationMs: 30_000 };

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('CircuitBreaker', () => {
  it('no abre el circuito antes del mínimo de solicitudes', () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('CLOSED');
  });

  it('abre el circuito cuando los fallos superan el 50 % en la ventana', () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    breaker.recordSuccess();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('CLOSED');
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('OPEN');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('exactamente 50 % no abre el circuito (debe superarlo)', () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    [true, true, true, false, false, false].forEach((ok) => (ok ? breaker.recordSuccess() : breaker.recordFailure()));
    expect(breaker.snapshot().state).toBe('CLOSED');
  });

  it('olvida los fallos que salen de la ventana de 1 minuto', () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    c.advance(61_000);
    breaker.recordFailure();
    expect(breaker.snapshot()).toMatchObject({ state: 'CLOSED', requestsInWindow: 1 });
  });

  it('pasa a HALF_OPEN tras la espera, deja una sola prueba y se cierra si tiene éxito', () => {
    const c = clock();
    const changes: string[] = [];
    const breaker = new CircuitBreaker('stripe', options, c.now, (_n, from, to) => changes.push(`${from}->${to}`));
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    c.advance(30_000);
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.snapshot().state).toBe('HALF_OPEN');
    expect(breaker.tryAcquire()).toBe(false);
    breaker.recordSuccess();
    expect(breaker.snapshot().state).toBe('CLOSED');
    expect(changes).toEqual(['CLOSED->OPEN', 'OPEN->HALF_OPEN', 'HALF_OPEN->CLOSED']);
  });

  it('vuelve a OPEN si la solicitud de prueba falla', () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    c.advance(30_000);
    breaker.tryAcquire();
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('OPEN');
  });
});

describe('CircuitBreakerPaymentProvider', () => {
  const input = { amount: '10.00', currency: 'BOB', paymentToken: 'pm_x', idempotencyKey: 'k' };

  it('con Stripe fallando abre el circuito y responde provider_unavailable sin llamar al proveedor', async () => {
    const c = clock();
    const inner = {
      authorize: jest.fn().mockResolvedValue({ outcome: 'timeout', errorCode: 'provider_timeout' }),
      capture: jest.fn(),
      queryStatus: jest.fn(),
    };
    const provider = new CircuitBreakerPaymentProvider(inner, new CircuitBreaker('stripe', options, c.now));
    for (let i = 0; i < 5; i++) await provider.authorize(input);
    expect(inner.authorize).toHaveBeenCalledTimes(5);

    const started = Date.now();
    await expect(provider.authorize(input)).resolves.toEqual({ outcome: 'error', errorCode: 'provider_unavailable' });
    expect(Date.now() - started).toBeLessThan(50);
    expect(inner.authorize).toHaveBeenCalledTimes(5);
  });

  it('un rechazo de tarjeta no cuenta como fallo del proveedor', async () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    const inner = {
      authorize: jest.fn().mockResolvedValue({ outcome: 'declined', errorCode: 'card_declined' }),
      capture: jest.fn(),
      queryStatus: jest.fn(),
    };
    const provider = new CircuitBreakerPaymentProvider(inner, breaker);
    for (let i = 0; i < 10; i++) await provider.authorize(input);
    expect(breaker.snapshot().state).toBe('CLOSED');
  });

  it('una excepción del adaptador cuenta como fallo y se propaga', async () => {
    const c = clock();
    const breaker = new CircuitBreaker('stripe', options, c.now);
    const inner = { authorize: jest.fn().mockRejectedValue(new Error('boom')), capture: jest.fn(), queryStatus: jest.fn() };
    const provider = new CircuitBreakerPaymentProvider(inner, breaker);
    await expect(provider.authorize(input)).rejects.toThrow('boom');
    expect(breaker.snapshot().requestsInWindow).toBe(1);
  });

  it('circuitos independientes: Stripe abierto no afecta a QR', async () => {
    const c = clock();
    const failing = { authorize: jest.fn().mockResolvedValue({ outcome: 'error' }), capture: jest.fn(), queryStatus: jest.fn() };
    const healthy = { authorize: jest.fn().mockResolvedValue({ outcome: 'approved' }), capture: jest.fn(), queryStatus: jest.fn() };
    const stripe = new CircuitBreakerPaymentProvider(failing, new CircuitBreaker('stripe', options, c.now));
    const qr = new CircuitBreakerPaymentProvider(healthy, new CircuitBreaker('qr', options, c.now));
    for (let i = 0; i < 5; i++) await stripe.authorize(input);
    await expect(stripe.authorize(input)).resolves.toMatchObject({ errorCode: 'provider_unavailable' });
    await expect(qr.authorize(input)).resolves.toEqual({ outcome: 'approved' });
  });
});
