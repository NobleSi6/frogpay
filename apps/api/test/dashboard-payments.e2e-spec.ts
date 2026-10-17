import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { AuthenticationGuard } from '../src/shared/auth/authentication.guard';
import { JwtTokenService } from '../src/shared/auth/jwt-token.service';
import { CreatePaymentUseCase } from '../src/modules/payments/application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../src/modules/payments/application/use-cases/get-payment.use-case';
import { ListPaymentsUseCase } from '../src/modules/payments/application/use-cases/list-payments.use-case';
import { PrismaTenantContextService } from '../src/shared/database/prisma-tenant-context.service';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { ProviderAdaptersModule } from '../src/modules/provider-adapters/provider-adapters.module';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { RedisService } from '../src/shared/cache/redis.service';
import { ConfigModule } from '@nestjs/config';
import type { UserRole } from '../src/modules/identity/domain/entities/user.entity';
import { RabbitMqEventBus } from '../src/shared/events/rabbitmq-event-bus';
import { OutboxEventPublisher } from '../src/shared/events/outbox-event-publisher.service';

describe('Dashboard Payments (e2e) - TSK-DEV1-402 / TSK-DEV3-203', () => {
  let app: INestApplication;
  let jwtService: JwtTokenService;
  let createPaymentUseCase: CreatePaymentUseCase;
  let getPaymentUseCase: GetPaymentUseCase;
  let listPaymentsUseCase: ListPaymentsUseCase;

  const testTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const testUserId = '550e8400-e29b-41d4-a716-446655440002';
  const validUuidKey = '550e8400-e29b-41d4-a716-446655440005';
  const testPaymentId = '550e8400-e29b-41d4-a716-446655440003';
  const dto = {
    amount: '100.00',
    currency: 'BOB',
    paymentMethod: 'card',
    merchantReference: 'test-order-e2e-001',
    paymentToken: 'pm_1Nk000000000000000000000',
  };

  const createToken = (tenantId: string, role: UserRole = 'OWNER') => {
    const user = {
      id: testUserId,
      email: 'owner@test.com',
      role,
      tenantId,
    };
    const { accessToken } = jwtService.sign(user);
    return accessToken;
  };

  const sampleResponse = {
    id: testPaymentId,
    status: 'approved',
    amount: '150.00',
    currency: 'BOB',
    paymentMethod: 'card',
    environment: 'sandbox',
    merchantReference: 'test-order-e2e',
    commissionAmount: '5.25',
    netAmount: '144.75',
    providerTransactionId: 'pi_test123',
    errorCode: null,
    createdAt: '2026-10-01T14:32:10.000Z',
    updatedAt: '2026-10-01T14:32:11.000Z',
  };

  const sampleDetailsResponse = {
    ...sampleResponse,
    transitions: [
      {
        from: null,
        to: 'pending',
        createdAt: '2026-10-01T14:32:10.000Z',
        actor: 'system',
      },
      {
        from: 'pending',
        to: 'approved',
        createdAt: '2026-10-01T14:32:11.000Z',
        actor: 'webhook',
      },
    ],
    statusHistory: [
      {
        previousStatus: null,
        newStatus: 'pending',
        metadata: {},
        createdAt: '2026-10-01T14:32:10.000Z',
      },
      {
        previousStatus: 'pending',
        newStatus: 'approved',
        metadata: {},
        createdAt: '2026-10-01T14:32:11.000Z',
      },
    ],
  };

  const sampleDeliveries = [
    {
      id: 'f7e9fbaa-ef25-4a1e-9e88-c9f55a4bf5c4',
      webhook_id: 'cd88e9d8-7eec-4cca-a142-3946e19980ef',
      payment_id: testPaymentId,
      tenant_id: testTenantId,
      status: 'delivered',
      attempt_count: 1,
      delivered_at: new Date('2026-10-01T14:32:15.000Z'),
      next_retry_at: null,
      created_at: new Date('2026-10-01T14:32:12.000Z'),
      updated_at: new Date('2026-10-01T14:32:15.000Z'),
    },
  ];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-jwt-secret-for-dashboard-e2e',
              STRIPE_SECRET_KEY: 'sk_test_dashboard_e2e',
              REDIS_HOST: 'localhost',
              REDIS_PORT: 6379,
              CREDENTIALS_ENCRYPTION_KEY: 'a'.repeat(64),
            }),
          ],
        }),
        PaymentsModule,
        IdentityModule,
        ProviderAdaptersModule,
        PrismaModule,
      ],
    })
      .overrideProvider(CreatePaymentUseCase)
      .useValue({
        execute: jest.fn().mockImplementation(
          async (
            _tenantId: string,
            environment: string,
            _idempotencyKey: string,
            paymentDto: typeof dto,
          ) => ({
            isReplay: false,
            response: {
              ...sampleResponse,
              amount: paymentDto.amount,
              currency: paymentDto.currency,
              paymentMethod: paymentDto.paymentMethod,
              environment,
              merchantReference: paymentDto.merchantReference,
            },
          }),
        ),
      })
      .overrideProvider(GetPaymentUseCase)
      .useValue({
        execute: jest.fn().mockResolvedValue(sampleDetailsResponse),
      })
      .overrideProvider(ListPaymentsUseCase)
      .useValue({
        execute: jest.fn().mockImplementation(async (_tenantId, query) => ({
          data: [sampleResponse],
          page: query.page ?? 1,
          limit: query.limit ?? 25,
          total: 1,
          totalPages: 1,
        })),
      })
      .overrideProvider(PrismaTenantContextService)
      .useValue({
        withTenant: jest.fn(
          async (_tenantId: string, callback: (tx: any) => Promise<unknown>) => {
            const mockTx = {
              webhook_delivery: {
                findMany: jest.fn().mockResolvedValue(sampleDeliveries),
              },
            };
            return callback(mockTx);
          },
        ),
      })
      .overrideProvider(RedisService)
      .useValue({
        on: jest.fn(),
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RabbitMqEventBus)
      .useValue({
        subscribe: jest.fn(),
        publish: jest.fn(),
        publishAll: jest.fn(),
        checkHealth: jest.fn(),
      })
      .overrideProvider(OutboxEventPublisher)
      .useValue({})
      .compile();

    jwtService = moduleRef.get<JwtTokenService>(JwtTokenService);
    createPaymentUseCase = moduleRef.get<CreatePaymentUseCase>(CreatePaymentUseCase);
    getPaymentUseCase = moduleRef.get<GetPaymentUseCase>(GetPaymentUseCase);
    listPaymentsUseCase = moduleRef.get<ListPaymentsUseCase>(ListPaymentsUseCase);

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new AuthenticationGuard(new Reflector(), jwtService));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /dashboard/payments (TSK-DEV1-402)', () => {
    it('should return server-paginated payments for session tenant with OWNER role', async () => {
      const token = createToken(testTenantId, 'OWNER');
      const mockExecute = jest.spyOn(listPaymentsUseCase, 'execute');

      const response = await request(app.getHttpServer())
        .get('/api/dashboard/payments?page=1&limit=25&status=approved')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        page: 1,
        limit: 25,
        total: 1,
        totalPages: 1,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: testPaymentId,
            status: 'approved',
            amount: '150.00',
            currency: 'BOB',
          }),
        ]),
      });

      expect(mockExecute).toHaveBeenCalledWith(
        testTenantId,
        expect.objectContaining({
          page: 1,
          limit: 25,
          status: 'approved',
        }),
      );
    });

    it('should return 401 if unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/payments')
        .expect(401);
    });

    it('should return 403 if user has VIEWER role instead of OWNER/ADMIN', async () => {
      const token = createToken(testTenantId, 'VIEWER' as UserRole);

      await request(app.getHttpServer())
        .get('/api/dashboard/payments')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('POST /dashboard/payments/test', () => {
    it('should force sandbox environment and create payment with session tenantId', async () => {
      const token = createToken(testTenantId);
      const mockExecute = jest.spyOn(createPaymentUseCase, 'execute');

      const response = await request(app.getHttpServer())
        .post('/api/dashboard/payments/test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', validUuidKey)
        .send(dto)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'approved',
        amount: '100.00',
        currency: 'BOB',
        environment: 'sandbox',
        merchantReference: 'test-order-e2e-001',
        paymentMethod: 'card',
      });

      // Verificar que se forzó sandbox (tenant del contexto + ambiente forzado)
      expect(mockExecute).toHaveBeenCalledWith(
        testTenantId,
        'sandbox', // Ambiente forzado
        validUuidKey,
        dto,
      );
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid UUID Idempotency-Key with 400', async () => {
      const token = createToken(testTenantId);

      await request(app.getHttpServer())
        .post('/api/dashboard/payments/test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'not-a-uuid')
        .send(dto)
        .expect(400);
    });

    it('should return 401 if no Authorization header', async () => {
      await request(app.getHttpServer())
        .post('/api/dashboard/payments/test')
        .set('Idempotency-Key', validUuidKey)
        .send(dto)
        .expect(401);
    });
  });

  describe('GET /dashboard/payments/:id', () => {
    it('should return payment details with status history and sanitized webhook deliveries', async () => {
      const token = createToken(testTenantId);
      const mockExecute = jest.spyOn(getPaymentUseCase, 'execute');

      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/payments/${testPaymentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testPaymentId,
        status: 'approved',
        amount: '150.00',
        currency: 'BOB',
        environment: 'sandbox',
        merchantReference: 'test-order-e2e',
        paymentMethod: 'card',
        commissionAmount: '5.25',
        netAmount: '144.75',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({
            previousStatus: null,
            newStatus: 'pending',
          }),
          expect.objectContaining({
            previousStatus: 'pending',
            newStatus: 'approved',
          }),
        ]),
        webhookDeliveries: expect.arrayContaining([
          expect.objectContaining({
            id: 'f7e9fbaa-ef25-4a1e-9e88-c9f55a4bf5c4',
            webhookId: 'cd88e9d8-7eec-4cca-a142-3946e19980ef',
            status: 'delivered',
            attemptCount: 1,
          }),
        ]),
      });

      // Verificar que se pasó el tenantId del contexto
      expect(mockExecute).toHaveBeenCalledWith(testTenantId, testPaymentId);
    });

    it('should return 404 if payment not found', async () => {
      const token = createToken(testTenantId);
      jest.spyOn(getPaymentUseCase, 'execute').mockRejectedValueOnce(
        new NotFoundException({
          code: 'payment_not_found',
          message: 'El pago solicitado no fue encontrado.',
          details: null,
        }),
      );

      await request(app.getHttpServer())
        .get(`/api/dashboard/payments/${testPaymentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 400 if paymentId is not a valid UUID', async () => {
      const token = createToken(testTenantId);

      await request(app.getHttpServer())
        .get('/api/dashboard/payments/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should return 401 if unauthenticated', async () => {
      await request(app.getHttpServer())
        .get(`/api/dashboard/payments/${testPaymentId}`)
        .expect(401);
    });

    it('should return 403 if user has VIEWER role', async () => {
      const token = createToken(testTenantId, 'VIEWER' as UserRole);

      await request(app.getHttpServer())
        .get(`/api/dashboard/payments/${testPaymentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
