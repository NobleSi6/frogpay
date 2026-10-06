import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { AuthenticationGuard } from '../src/shared/auth/authentication.guard';
import { JwtTokenService } from '../src/shared/auth/jwt-token.service';
import { CreatePaymentUseCase } from '../src/modules/payments/application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../src/modules/payments/application/use-cases/get-payment.use-case';
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

describe('Dashboard Payments (e2e) - TSK-DEV3-203', () => {
  let app: INestApplication;
  let jwtService: JwtTokenService;
  let createPaymentUseCase: CreatePaymentUseCase;
  let getPaymentUseCase: GetPaymentUseCase;

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

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new AuthenticationGuard(new Reflector(), jwtService));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
    it('should return payment details with status history for session tenant', async () => {
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
  });
});
