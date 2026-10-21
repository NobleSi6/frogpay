import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuditController } from '../src/modules/audit/presentation/http/audit.controller';
import { AuditService } from '../src/modules/audit/application/audit.service';
import { AuthenticationGuard } from '../src/shared/auth/authentication.guard';
import { JwtTokenService } from '../src/shared/auth/jwt-token.service';
import { RolesGuard } from '../src/shared/auth/roles.guard';
import type { UserRole } from '../src/modules/identity/domain/entities/user.entity';

describe('Dashboard audit logs (e2e)', () => {
  let app: INestApplication;
  let tokens: JwtTokenService;
  const tenantId = 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b';
  const userId = 'd3b07384-d113-4a6c-9c76-5a4d6f8e2e1a';
  const paymentId = '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391';
  const auditRecord = {
    eventId: '9e84723b-ec5f-4bb8-a665-000000000001',
    entity: 'payment',
    entityId: paymentId,
    action: 'pago.aprobado',
    previousState: { status: 'pending' },
    newState: { status: 'approved' },
    actor: { type: 'system' },
    requestId: 'req_audit_e2e',
    environment: 'sandbox',
    createdAt: '2026-10-19T12:00:00.000Z',
  };
  const auditService = {
    list: jest.fn().mockResolvedValue({
      data: [auditRecord],
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    }),
  };

  const tokenFor = (role: UserRole): string =>
    tokens.sign({
      id: userId,
      email: 'owner@example.test',
      role,
      tenantId,
    }).accessToken;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        Reflector,
        JwtTokenService,
        { provide: ConfigService, useValue: { get: jest.fn(() => 3600), getOrThrow: jest.fn(() => 'audit-e2e-jwt-secret-32-characters') } },
        { provide: AuditService, useValue: auditService },
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
    auditService.list.mockClear();
  });

  it('returns paginated audit entries in descending order with all public fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/audit-logs?page=1&limit=25')
      .set('Authorization', `Bearer ${tokenFor('OWNER')}`)
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          eventId: auditRecord.eventId,
          entity: 'payment',
          entityId: paymentId,
          action: 'pago.aprobado',
          previousState: { status: 'pending' },
          newState: { status: 'approved' },
          actor: { type: 'system' },
          requestId: 'req_audit_e2e',
          environment: 'sandbox',
          createdAt: '2026-10-19T12:00:00.000Z',
        },
      ],
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    });
    expect(auditService.list).toHaveBeenCalledWith(tenantId, {
      page: 1,
      limit: 25,
      paymentId: undefined,
      action: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('passes payment, action, date-range, and pagination filters to the audit query', async () => {
    await request(app.getHttpServer())
      .get(
        `/api/dashboard/audit-logs?page=2&limit=10&paymentId=${paymentId}&action=pago.aprobado&from=2026-10-18T00:00:00.000Z&to=2026-10-20T00:00:00.000Z`,
      )
      .set('Authorization', `Bearer ${tokenFor('OWNER')}`)
      .expect(200);

    expect(auditService.list).toHaveBeenCalledWith(tenantId, {
      page: 2,
      limit: 10,
      paymentId,
      action: 'pago.aprobado',
      from: new Date('2026-10-18T00:00:00.000Z'),
      to: new Date('2026-10-20T00:00:00.000Z'),
    });
  });

  it('requires a session and restricts access to OWNER', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/audit-logs')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/dashboard/audit-logs')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .expect(403);
  });
});
