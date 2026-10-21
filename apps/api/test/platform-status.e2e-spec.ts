import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PlatformStatusController } from '../src/modules/platform-status/platform-status.controller';
import { PlatformStatusService } from '../src/modules/platform-status/platform-status.service';
import { AuthenticationGuard } from '../src/shared/auth/authentication.guard';
import { JwtTokenService } from '../src/shared/auth/jwt-token.service';
import { RolesGuard } from '../src/shared/auth/roles.guard';
import type { UserRole } from '../src/modules/identity/domain/entities/user.entity';

describe('Platform status (e2e)', () => {
  let app: INestApplication;
  let tokens: JwtTokenService;
  const statusResponse = {
    status: 'ok',
    timestamp: '2026-10-19T12:00:00.000Z',
    services: {
      api: { status: 'up', uptime: 120 },
      database: { status: 'up', type: 'postgresql', latencyMs: 2 },
      eventBus: { status: 'up', provider: 'rabbitmq' },
      redis: { status: 'up' },
    },
    circuitBreakers: [{ provider: 'stripe', state: 'closed', failures: 0 }],
    outbox: { pending: 0 },
  };
  const platformStatus = {
    getStatus: jest.fn().mockResolvedValue(statusResponse),
  };

  const tokenFor = (role: UserRole): string =>
    tokens.sign({
      id: 'd3b07384-d113-4a6c-9c76-5a4d6f8e2e1a',
      email: 'admin@example.test',
      role,
    }).accessToken;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformStatusController],
      providers: [
        Reflector,
        JwtTokenService,
        { provide: ConfigService, useValue: { get: jest.fn(() => 3600), getOrThrow: jest.fn(() => 'platform-status-e2e-jwt-secret') } },
        { provide: PlatformStatusService, useValue: platformStatus },
      ],
    }).compile();

    const reflector = moduleRef.get(Reflector);
    tokens = moduleRef.get(JwtTokenService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalGuards(
      new AuthenticationGuard(reflector, tokens),
      new RolesGuard(reflector),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns platform health to a PLATFORM_ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/platform-status')
      .set('Authorization', `Bearer ${tokenFor('PLATFORM_ADMIN')}`)
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      timestamp: expect.any(String),
      services: {
        api: { status: 'up' },
        database: { status: 'up' },
        eventBus: { status: 'up' },
        redis: { status: 'up' },
      },
      circuitBreakers: expect.any(Array),
      outbox: { pending: 0 },
    });
    expect(platformStatus.getStatus).toHaveBeenCalledTimes(1);
  });

  it('requires a session and denies roles not enabled on the current route', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/platform-status')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/admin/platform-status')
      .set('Authorization', `Bearer ${tokenFor('OWNER')}`)
      .expect(403);
  });
});
