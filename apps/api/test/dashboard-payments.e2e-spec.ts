import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtTokenService } from '../src/shared/auth/jwt-token.service';
import { RolesGuard } from '../src/shared/auth/roles.guard';
import { PaymentsController } from '../src/modules/payments/presentation/http/payments.controller';
import { DashboardPaymentsController } from '../src/modules/payments/presentation/http/dashboard-payments.controller';
import { CreatePaymentUseCase } from '../src/modules/payments/application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../src/modules/payments/application/use-cases/get-payment.use-case';
import { IdempotencyService } from '../src/modules/payments/infrastructure/idempotency/idempotency.service';
import { PaymentProviderPort } from '../src/modules/provider-adapters/ports/payment-provider.port';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { ProviderAdaptersModule } from '../src/modules/provider-adapters/provider-adapters.module';
import { PrismaModule } from '../src/shared/database/prisma.module';
import { ConfigModule } from '@nestjs/config';

describe('Dashboard Payments (e2e) - TSK-DEV3-203', () => {
  let app: INestApplication;
  let jwtService: JwtTokenService;
  let createPaymentUseCase: CreatePaymentUseCase;
  let getPaymentUseCase: GetPaymentUseCase;
  let idempotencyService: IdempotencyService;

  const testTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const testUserId = '550e8400-e29b-41d4-a716-446655440002';
  const testAnotherTenantId = '650e8400-e29b-41d4-a716-446655440004';
  const validUuidKey = '550e8400-e29b-41d4-a716-446655440005';
  const testPaymentId = '550e8400-e29b-41d4-a716-446655440003';

  const createToken = (tenantId: string, role: string = 'OWNER') => {
    const user = {
      id: testUserId,
      email: 'owner@test.com',
      role,
      tenantId,
    };
    const { accessToken } = jwtService.sign(user);
    return accessToken;
  };

  const authContext: any = {
    userId: testUserId,
    email: 'owner@test.com',
    role: 'OWNER',
    tenantId: testTenantId,
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
          load: [],
        }),
        PaymentsModule,
        IdentityModule,
        ProviderAdaptersModule,
        PrismaModule,
      ],
    })
      .overrideProvider(CreatePaymentUseCase)
      .useValue({
        execute: jest.fn().mockResolvedValue({
          isReplay: false,
          response: sampleResponse,
        }),
      })
      .overrideProvider(GetPaymentUseCase)
      .useValue({
        execute: jest.fn().mockResolvedValue(sampleDetailsResponse),
      })
      .overrideProvider(IdempotencyService)
      .useValue({
        computeCanonicalBodyHash: jest.fn().mockReturnValue('mocked-hash'),
        acquireLock: jest.fn(),
        saveResult: jest.fn(),
        releaseLock: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwtService = moduleRef.get<JwtTokenService>(JwtTokenService);
    createPaymentUseCase = moduleRef.get<CreatePaymentUseCase>(CreatePaymentUseCase);
    getPaymentUseCase = moduleRef.get<GetPaymentUseCase>(GetPaymentUseCase);
    idempotencyService = moduleRef.get<IdempotencyService>(IdempotencyService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /dashboard/payments/test', () => {
    const dto = {
      amount: '100.00',
      currency: 'BOB',
      paymentMethod: 'card',
      merchantReference: 'test-order-e2e-001',
      paymentToken: 'pm_1Nk000000000000000000000',
    };

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
        new Error('Payment not found'),
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

  describe('Idempotency - TSK-DEV3-201', () => {
    it('should acquire lock in Redis with correct key format', async () => {
      const mockAcquireLock = jest.spyOn(idempotencyService, 'acquireLock');

      const token = createToken(testTenantId);
      await request(app.getHttpServer())
        .post('/api/dashboard/payments/test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', validUuidKey)
        .send(dto)
        .expect(201);

      // Verificar que la clave se construyó correctamente
      expect(mockAcquireLock).toHaveBeenCalledWith(
        testTenantId,
        'sandbox', // environment
        validUuidKey,
        expect.any(String), // bodyHash
      );
    });

    it('should return 409 for concurrent requests with same Idempotency-Key', async () => {
      // Simular que el lock ya está en PROCESSING
      jest.spyOn(idempotencyService, 'acquireLock').mockRejectedValueOnce(
        new Error('Conflict: idempotency_in_progress'),
      );

      const token = createToken(testTenantId);

      await request(app.getHttpServer())
        .post('/api/dashboard/payments/test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', validUuidKey)
        .send(dto)
        .expect(409);
    });

    it('should return 422 if same key with different body hash', async () => {
      // Simular que la clave ya existe con hash distinto
      jest.spyOn(idempotencyService, 'acquireLock').mockRejectedValueOnce(
        new Error('Unprocessable Entity: idempotency_key_reused'),
      );

      const token = createToken(testTenantId);

      await request(app.getHttpServer())
        .post('/api/dashboard/payments/test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', validUuidKey)
        .send({ ...dto, amount: '200.00' }) // Diferente monto
        .expect(422);
    });
  });
});
