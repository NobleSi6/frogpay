import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DashboardMetricsController } from '../src/modules/dashboard/presentation/http/dashboard-metrics.controller';
import { DashboardMetricsService } from '../src/modules/dashboard/application/dashboard-metrics.service';
import { AuthenticationGuard } from '../src/shared/auth/authentication.guard';
import { JwtTokenService } from '../src/shared/auth/jwt-token.service';
import { RolesGuard } from '../src/shared/auth/roles.guard';
import { PrismaTenantContextService } from '../src/shared/database/prisma-tenant-context.service';
import { RedisService } from '../src/shared/cache/redis.service';
import type { UserRole } from '../src/modules/identity/domain/entities/user.entity';

describe('Dashboard metrics (e2e)', () => {
  let app: INestApplication;
  let tokens: JwtTokenService;
  const tenantId = 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b';
  const userId = 'd3b07384-d113-4a6c-9c76-5a4d6f8e2e1a';
  const findMany = jest.fn().mockResolvedValue([]);
  const withTenant = jest.fn(
    async (_tenantId: string, callback: (tx: { payment: { findMany: jest.Mock } }) => Promise<unknown>) =>
      callback({ payment: { findMany } }),
  );
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
  const cacheTtlSeconds = 300;

  const tokenFor = (role: UserRole): string =>
    tokens.sign({
      id: userId,
      email: 'owner@example.test',
      role,
      tenantId,
    }).accessToken;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardMetricsController],
      providers: [
        Reflector,
        JwtTokenService,
        { provide: ConfigService, useValue: { get: jest.fn(() => 3600), getOrThrow: jest.fn(() => 'metrics-e2e-jwt-secret-32-characters') } },
        DashboardMetricsService,
        { provide: PrismaTenantContextService, useValue: { withTenant } },
        { provide: RedisService, useValue: redis },
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    findMany.mockClear();
    withTenant.mockClear();
    redis.get.mockClear();
    redis.set.mockClear();
  });

  it('returns tenant metrics with exactly one daily-series entry per requested day and caches for five minutes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/metrics?days=7&environment=sandbox')
      .set('Authorization', `Bearer ${tokenFor('OWNER')}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
        environment: 'sandbox',
        currency: 'BOB',
        volume: '0.00',
        transactionCount: 0,
        approvalRate: 0,
        commissionAmount: '0.00',
        netAmount: '0.00',
        byMethod: [],
        dailySeries: expect.any(Array),
        generatedAt: expect.any(String),
      }),
    );
    expect(response.body.dailySeries).toHaveLength(7);
    expect(response.body.dailySeries[0]).toEqual(
      expect.objectContaining({
        date: expect.any(String),
        transactionCount: 0,
        volume: '0.00',
        approvedCount: 0,
        rejectedCount: 0,
        failedCount: 0,
        pendingCount: 0,
        approvalRate: 0,
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ environment: 'sandbox' }),
      }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(`:${tenantId}:sandbox:7:`),
      expect.any(String),
      'EX',
      cacheTtlSeconds,
    );
  });

  it('supports the 30-day production range and only allows configured dashboard roles', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/metrics?days=30&environment=production')
      .set('Authorization', `Bearer ${tokenFor('OPERATOR')}`)
      .expect(200);

    expect(response.body.environment).toBe('production');
    expect(response.body.dailySeries).toHaveLength(30);

    await request(app.getHttpServer())
      .get('/api/dashboard/metrics?days=7&environment=sandbox')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .expect(403);
  });

  it('requires a session and validates days and environment', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/metrics?days=7&environment=sandbox')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/dashboard/metrics?days=14&environment=sandbox')
      .set('Authorization', `Bearer ${tokenFor('OWNER')}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/dashboard/metrics?days=7')
      .set('Authorization', `Bearer ${tokenFor('OWNER')}`)
      .expect(400);
  });
});
