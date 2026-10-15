import { CircuitBreaker } from './circuit-breaker';
import { CircuitBreakerPaymentProvider } from './circuit-breaker-payment-provider';
import { ProviderFaultInjector } from './provider-fault-injector';

const META = { id: 'stripe', displayName: 'Stripe', methods: [] };
const options = { failureRateThreshold: 0.5, windowMs: 60_000, minimumRequests: 5, openDurationMs: 30_000 };
const input = { amount: '10.00', currency: 'BOB', paymentToken: 'pm_x', idempotencyKey: 'k' };

function healthyAdapter() {
  return {
    metadata: META,
    authorize: jest.fn().mockResolvedValue({ outcome: 'approved' }),
    capture: jest.fn(),
    queryStatus: jest.fn(),
  };
}

describe('ProviderFaultInjector', () => {
  it('modo error: el proveedor responde provider_unavailable sin ser llamado y el circuito se abre', async () => {
    const faults = new ProviderFaultInjector();
    faults.inject({ provider: 'Stripe', mode: 'error', durationSeconds: 60 });
    const inner = healthyAdapter();
    const breaker = new CircuitBreaker('stripe', options);
    const provider = new CircuitBreakerPaymentProvider(inner, breaker, faults);

    for (let i = 0; i < 5; i++) {
      await expect(provider.authorize(input)).resolves.toEqual({ outcome: 'error', errorCode: 'provider_unavailable' });
    }
    expect(inner.authorize).not.toHaveBeenCalled();
    expect(breaker.snapshot().state).toBe('OPEN');
  });

  it('solo afecta al proveedor indicado: QR sigue funcionando', async () => {
    const faults = new ProviderFaultInjector();
    faults.inject({ provider: 'stripe', mode: 'error', durationSeconds: 60 });
    const qr = new CircuitBreakerPaymentProvider(
      { ...healthyAdapter(), metadata: { ...META, id: 'qr-local' } },
      new CircuitBreaker('qr-local', options),
      faults,
    );
    await expect(qr.authorize(input)).resolves.toEqual({ outcome: 'approved' });
  });

  it('modo latencia ≥ 3.000 ms termina en provider_timeout', async () => {
    jest.useFakeTimers();
    const faults = new ProviderFaultInjector();
    faults.inject({ provider: 'stripe', mode: 'latency', latencyMs: 5000, durationSeconds: 60 });
    const provider = new CircuitBreakerPaymentProvider(healthyAdapter(), new CircuitBreaker('stripe', options), faults);
    const pending = provider.authorize(input);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toEqual({ outcome: 'timeout', errorCode: 'provider_timeout' });
    jest.useRealTimers();
  });

  it('la falla vence sola tras su duración y también se puede limpiar', () => {
    let now = 1_000_000;
    const faults = new ProviderFaultInjector(() => now);
    faults.inject({ provider: 'stripe', mode: 'error', durationSeconds: 10 });
    faults.inject({ provider: 'qr-local', mode: 'error', durationSeconds: 60 });
    expect(faults.list()).toHaveLength(2);
    now += 10_000;
    expect(faults.active('stripe')).toBeNull();
    faults.clear('qr-local');
    expect(faults.list()).toEqual([]);
  });

  it('no permite inyectar fallas en producción', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new ProviderFaultInjector().inject({ provider: 'stripe', mode: 'error', durationSeconds: 5 })).toThrow();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
