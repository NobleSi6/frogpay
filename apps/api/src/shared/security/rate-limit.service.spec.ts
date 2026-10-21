import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';

function setup(plan: { name: string; features?: Record<string, unknown> } | null = { name: 'Free' }) {
  const counters = new Map<string, number>();
  const redis = {
    eval: jest.fn(async (_script: string, _n: number, key: string) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return [count, 42_000];
    }),
  };
  const db = {
    withGlobalAccess: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({ tenant: { findUnique: jest.fn().mockResolvedValue(plan ? { plan } : null) } }),
    ),
  };
  const service = new RateLimitService(
    redis as never,
    db as never,
    new ConfigService({ RATE_LIMIT_FREE_PER_MINUTE: '3', RATE_LIMIT_PREMIUM_PER_MINUTE: '5' }),
  );
  return { service, redis, db };
}

describe('RateLimitService (TSK-DEV2-403)', () => {
  it('permite hasta el límite del plan Free y bloquea la siguiente con Retry-After', async () => {
    const { service } = setup({ name: 'Free' });
    for (let i = 0; i < 3; i++) await expect(service.hit('t-1', 'k-1')).resolves.toMatchObject({ allowed: true, limit: 3 });
    await expect(service.hit('t-1', 'k-1')).resolves.toEqual({ allowed: false, limit: 3, remaining: 0, retryAfterSeconds: 42 });
  });

  it('el plan Premium tiene un límite mayor', async () => {
    const { service } = setup({ name: 'Premium' });
    for (let i = 0; i < 5; i++) await expect(service.hit('t-2')).resolves.toMatchObject({ allowed: true, limit: 5 });
    await expect(service.hit('t-2')).resolves.toMatchObject({ allowed: false });
  });

  it('features.requestsPerMinute del plan reemplaza al límite por defecto', async () => {
    const { service } = setup({ name: 'Free', features: { requestsPerMinute: 1 } });
    await expect(service.hit('t-3')).resolves.toMatchObject({ allowed: true, limit: 1 });
    await expect(service.hit('t-3')).resolves.toMatchObject({ allowed: false });
  });

  it('cuenta por tenant: dos API Keys del mismo tenant comparten el límite', async () => {
    const { service } = setup({ name: 'Free' });
    await service.hit('t-4', 'k-a');
    await service.hit('t-4', 'k-b');
    await service.hit('t-4', 'k-a');
    await expect(service.hit('t-4', 'k-b')).resolves.toMatchObject({ allowed: false });
  });

  it('cachea el plan para no consultar la BD en cada solicitud', async () => {
    const { service, db } = setup();
    await service.hit('t-5');
    await service.hit('t-5');
    expect(db.withGlobalAccess).toHaveBeenCalledTimes(1);
  });

  it('si Redis falla deja pasar la solicitud (fail-open)', async () => {
    const { service, redis } = setup();
    redis.eval.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.hit('t-6', 'k-1')).resolves.toMatchObject({ allowed: true });
  });
});
