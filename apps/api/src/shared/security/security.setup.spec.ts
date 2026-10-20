import { Controller, Get, INestApplication, Module, Post, UseInterceptors } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../http/http-exception.filter';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitService } from './rate-limit.service';
import { applySecurity } from './security.setup';

@Controller()
class DemoController {
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Post('api/v1/test/simulators/provider-fault')
  simulator() {
    return { ok: true };
  }

  @Get('limited')
  @UseInterceptors(RateLimitInterceptor)
  limited() {
    return { ok: true };
  }
}

describe('Hardening HTTP (TSK-DEV2-403)', () => {
  let app: INestApplication;
  const rateLimit = { hit: jest.fn() };

  beforeAll(async () => {
    @Module({ controllers: [DemoController], providers: [RateLimitInterceptor, { provide: RateLimitService, useValue: rateLimit }] })
    class DemoModule {}
    const moduleRef = await Test.createTestingModule({ imports: [DemoModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: { tenantId?: string; headers: Record<string, string> }, _res: unknown, next: () => void) => {
      req.tenantId = req.headers['x-test-tenant'];
      next();
    });
    applySecurity(app, 'https://dashboard.frogpay.test, http://localhost:3001');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(() => app.close());

  it('agrega las cabeceras de seguridad de helmet y oculta X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/ping').expect(200);
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS permite solo los orígenes del dashboard', async () => {
    const allowed = await request(app.getHttpServer()).get('/ping').set('Origin', 'https://dashboard.frogpay.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://dashboard.frogpay.test');

    const blocked = await request(app.getHttpServer()).get('/ping').set('Origin', 'https://sitio-malicioso.com');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde 429 rate_limit_exceeded con Retry-After al superar el límite', async () => {
    rateLimit.hit.mockResolvedValueOnce({ allowed: true, limit: 60, remaining: 59, retryAfterSeconds: 0 });
    const ok = await request(app.getHttpServer()).get('/limited').set('x-test-tenant', 't-1').expect(200);
    expect(ok.headers['x-ratelimit-remaining']).toBe('59');

    rateLimit.hit.mockResolvedValueOnce({ allowed: false, limit: 60, remaining: 0, retryAfterSeconds: 17 });
    const limited = await request(app.getHttpServer()).get('/limited').set('x-test-tenant', 't-1').expect(429);
    expect(limited.headers['retry-after']).toBe('17');
    expect(limited.body.code).toBe('rate_limit_exceeded');
  });

  it('no limita solicitudes sin tenant (rutas públicas)', async () => {
    rateLimit.hit.mockClear();
    await request(app.getHttpServer()).get('/limited').expect(200);
    expect(rateLimit.hit).not.toHaveBeenCalled();
  });

  it('los simuladores /v1/test/* responden 403 en producción y funcionan en desarrollo', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await request(app.getHttpServer()).post('/api/v1/test/simulators/provider-fault').expect(403);
      process.env.NODE_ENV = 'development';
      await request(app.getHttpServer()).post('/api/v1/test/simulators/provider-fault').expect(201);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
