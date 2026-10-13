import { ConfigService } from '@nestjs/config';
import { HealthController } from '../../health/presentation/http/health.controller';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';

describe('CircuitBreakerRegistry', () => {
  it('lee la configuración CIRCUIT_BREAKER_* y crea un circuito por proveedor', () => {
    const registry = new CircuitBreakerRegistry(new ConfigService({ CIRCUIT_BREAKER_MIN_REQUESTS: '2' }));
    const stripe = registry.get('Stripe');
    expect(registry.get('stripe')).toBe(stripe);
    stripe.recordFailure();
    stripe.recordFailure();
    expect(registry.snapshot()).toEqual([expect.objectContaining({ name: 'stripe', state: 'OPEN' })]);
  });

  it('el health check muestra los circuitos sin marcar la API como caída', async () => {
    const registry = new CircuitBreakerRegistry(new ConfigService({ CIRCUIT_BREAKER_MIN_REQUESTS: '1' }));
    registry.get('stripe').recordFailure();
    const up = { check: jest.fn().mockReturnValue({ status: 'up' }) };
    const controller = new HealthController(
      up as never,
      { check: jest.fn().mockResolvedValue({ status: 'up' }) } as never,
      up as never,
      registry,
    );
    const res = { status: jest.fn() };

    const body = await controller.checkHealth(res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.status).toBe('ok');
    expect(body.circuitBreakers).toEqual([expect.objectContaining({ name: 'stripe', state: 'OPEN' })]);
  });
});
