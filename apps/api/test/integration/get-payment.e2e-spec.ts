import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PaymentsController } from '../../src/modules/payments/presentation/http/payments.controller';
import { GetPaymentUseCase } from '../../src/modules/payments/application/use-cases/get-payment.use-case';
import { CreatePaymentUseCase } from '../../src/modules/payments/application/use-cases/create-payment.use-case';
import { ApiKeyAuthGuard } from '../../src/modules/payments/presentation/guards/api-key-auth.guard';
import { PrismaTenantContextService } from '../../src/shared/database/prisma-tenant-context.service';
import { HttpExceptionFilter } from '../../src/shared/http/http-exception.filter';

describe('GET /v1/payments/:id (Integration) - TSK-DEV1-401', () => {
  let app: INestApplication;

  const tenantA = '550e8400-e29b-41d4-a716-446655440001';
  const tenantB = '550e8400-e29b-41d4-a716-446655440002';
  const paymentIdTenantA = '6f1b2e34-5678-40ab-8def-1234567890aa';
  const paymentIdExpired = '6f1b2e34-5678-40ab-8def-1234567890bb';
  const paymentIdRefunded = '6f1b2e34-5678-40ab-8def-1234567890cc';
  const paymentIdNonExistent = '6f1b2e34-5678-40ab-8def-1234567890ff';

  const validApiKeyTenantA = 'fp_test_tenantA.secret1234567890abcdef';
  const validApiKeyTenantB = 'fp_test_tenantB.secret1234567890abcdef';

  const mockPaymentsDb: Record<string, any> = {
    [`${paymentIdTenantA}_${tenantA}`]: {
      id: paymentIdTenantA,
      tenant_id: tenantA,
      amount: '150.00',
      currency: 'BOB',
      status: 'approved',
      environment: 'sandbox',
      merchant_reference: 'ORDEN-1001',
      commission_amount: '1.50',
      net_amount: '148.50',
      provider_transaction_id: 'BT-2026-A81F92',
      error_code: null,
      qr_payload: '0002010102126304A1B2',
      bank_instructions: {
        bankName: 'Banco FrogPay Simulado',
        accountNumber: '10000012345',
        accountHolder: 'FrogPay Bolivia',
        amount: '150.00',
        currency: 'BOB',
        reference: 'BT-2026-A81F92',
      },
      expires_at: new Date('2026-10-12T20:00:00.000Z'),
      created_at: new Date('2026-10-11T19:00:00.000Z'),
      updated_at: new Date('2026-10-11T19:05:00.000Z'),
      provider: { payment_method: { code: 'bank_transfer' } },
      payment_status_history: [
        {
          previous_status: null,
          new_status: 'pending',
          metadata: { actor: 'system' },
          created_at: new Date('2026-10-11T19:00:00.000Z'),
        },
        {
          previous_status: 'pending',
          new_status: 'approved',
          metadata: { actor: 'webhook' },
          created_at: new Date('2026-10-11T19:05:00.000Z'),
        },
      ],
    },
    [`${paymentIdExpired}_${tenantA}`]: {
      id: paymentIdExpired,
      tenant_id: tenantA,
      amount: '200.00',
      currency: 'BOB',
      status: 'expired',
      environment: 'sandbox',
      merchant_reference: 'ORDEN-EXPIRED-1002',
      commission_amount: null,
      net_amount: null,
      provider_transaction_id: null,
      error_code: null,
      qr_payload: '0002010102126304A1B2',
      bank_instructions: null,
      expires_at: new Date('2026-10-12T20:00:00.000Z'),
      created_at: new Date('2026-10-11T19:00:00.000Z'),
      updated_at: new Date('2026-10-12T20:01:00.000Z'),
      provider: { payment_method: { code: 'qr' } },
      payment_status_history: [
        {
          previous_status: null,
          new_status: 'pending',
          metadata: { actor: 'system' },
          created_at: new Date('2026-10-11T19:00:00.000Z'),
        },
        {
          previous_status: 'pending',
          new_status: 'expired',
          metadata: { actor: 'system' },
          created_at: new Date('2026-10-12T20:01:00.000Z'),
        },
      ],
    },
    [`${paymentIdRefunded}_${tenantA}`]: {
      id: paymentIdRefunded,
      tenant_id: tenantA,
      amount: '300.00',
      currency: 'BOB',
      status: 'refunded',
      environment: 'sandbox',
      merchant_reference: 'ORDEN-REFUNDED-1003',
      commission_amount: '3.00',
      net_amount: '297.00',
      provider_transaction_id: 'BT-REFUND-123',
      error_code: null,
      qr_payload: null,
      bank_instructions: null,
      expires_at: null,
      created_at: new Date('2026-10-10T10:00:00.000Z'),
      updated_at: new Date('2026-10-11T12:00:00.000Z'),
      provider: { payment_method: { code: 'card' } },
      payment_status_history: [
        {
          previous_status: null,
          new_status: 'pending',
          metadata: { actor: 'system' },
          created_at: new Date('2026-10-10T10:00:00.000Z'),
        },
        {
          previous_status: 'pending',
          new_status: 'approved',
          metadata: { actor: 'webhook' },
          created_at: new Date('2026-10-10T10:02:00.000Z'),
        },
        {
          previous_status: 'approved',
          new_status: 'refunded',
          metadata: { actor: 'user' },
          created_at: new Date('2026-10-11T12:00:00.000Z'),
        },
      ],
    },
  };

  beforeAll(async () => {
    const mockPrismaTenantContext = {
      withTenant: jest.fn(async (tenantId: string, callback: (tx: any) => Promise<any>) => {
        const mockTx = {
          payment: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              const { id, tenant_id } = where.id_tenant_id;
              return mockPaymentsDb[`${id}_${tenant_id}`] ?? null;
            }),
          },
        };
        return callback(mockTx);
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        GetPaymentUseCase,
        {
          provide: CreatePaymentUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: PrismaTenantContextService,
          useValue: mockPrismaTenantContext,
        },
      ],
    })
      .overrideGuard(ApiKeyAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const authHeader = req.headers['x-api-key'];

          if (!authHeader) {
            return false;
          }

          if (authHeader === validApiKeyTenantA) {
            req.apiKeyContext = {
              tenantId: tenantA,
              environment: 'sandbox',
              apiKeyId: 'key-a',
              keyPrefix: 'fp_test_tenantA',
            };
            return true;
          }

          if (authHeader === validApiKeyTenantB) {
            req.apiKeyContext = {
              tenantId: tenantB,
              environment: 'sandbox',
              apiKeyId: 'key-b',
              keyPrefix: 'fp_test_tenantB',
            };
            return true;
          }

          return false;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('DoD 1: Pago existe y pertenece al tenant', () => {
    it('debe responder 200 OK con todos los campos calculados y requeridos', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdTenantA}`)
        .set('X-Api-Key', validApiKeyTenantA)
        .expect(200);

      expect(response.body).toMatchObject({
        id: paymentIdTenantA,
        status: 'approved',
        amount: '150.00',
        currency: 'BOB',
        paymentMethod: 'bank_transfer',
        merchantReference: 'ORDEN-1001',
        commissionAmount: '1.50',
        netAmount: '148.50',
        environment: 'sandbox',
        errorCode: null,
        createdAt: '2026-10-11T19:00:00.000Z',
        updatedAt: '2026-10-11T19:05:00.000Z',
        expiresAt: '2026-10-12T20:00:00.000Z',
      });

      // No debe filtrar datos de pago en pendiente al estar aprobado
      expect(response.body.qrPayload).toBeNull();
      expect(response.body.bankInstructions).toBeNull();
    });
  });

  describe('DoD 2: Historial de transiciones presente', () => {
    it('debe incluir transitions con orden cronológico y actor', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdTenantA}`)
        .set('X-Api-Key', validApiKeyTenantA)
        .expect(200);

      expect(Array.isArray(response.body.transitions)).toBe(true);
      expect(response.body.transitions).toHaveLength(2);

      expect(response.body.transitions[0]).toEqual({
        from: null,
        to: 'pending',
        createdAt: '2026-10-11T19:00:00.000Z',
        actor: 'system',
      });

      expect(response.body.transitions[1]).toEqual({
        from: 'pending',
        to: 'approved',
        createdAt: '2026-10-11T19:05:00.000Z',
        actor: 'webhook',
      });
    });
  });

  describe('DoD 3: Tenant Isolation (Pago de otro tenant)', () => {
    it('debe responder 404 Not Found cuando Tenant B consulta el pago de Tenant A', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdTenantA}`)
        .set('X-Api-Key', validApiKeyTenantB)
        .expect(404);

      expect(response.body.code).toBe('payment_not_found');
    });
  });

  describe('DoD 4: Sin X-Api-Key', () => {
    it('debe responder 401 Unauthorized si la cabecera X-Api-Key está ausente', async () => {
      await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdTenantA}`)
        .expect(401);
    });
  });

  describe('DoD 5: Pago inexistente', () => {
    it('debe responder 404 Not Found si el UUID no existe para el tenant', async () => {
      await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdNonExistent}`)
        .set('X-Api-Key', validApiKeyTenantA)
        .expect(404);
    });
  });

  describe('Validación de formato de ID', () => {
    it('debe responder 400 Bad Request si el ID no es un UUID válido', async () => {
      await request(app.getHttpServer())
        .get('/v1/payments/id-no-valido-123')
        .set('X-Api-Key', validApiKeyTenantA)
        .expect(400);
    });
  });

  describe('Nuevos estados de pago (expired / refunded)', () => {
    it('debe responder 200 OK cuando el pago tiene estado expired sin romper el serializado', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdExpired}`)
        .set('X-Api-Key', validApiKeyTenantA)
        .expect(200);

      expect(response.body).toMatchObject({
        id: paymentIdExpired,
        status: 'expired',
        amount: '200.00',
        currency: 'BOB',
        paymentMethod: 'qr',
        merchantReference: 'ORDEN-EXPIRED-1002',
      });
      expect(response.body.qrPayload).toBeNull();
      expect(response.body.bankInstructions).toBeNull();
    });

    it('debe responder 200 OK cuando el pago tiene estado refunded sin romper el serializado', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/payments/${paymentIdRefunded}`)
        .set('X-Api-Key', validApiKeyTenantA)
        .expect(200);

      expect(response.body).toMatchObject({
        id: paymentIdRefunded,
        status: 'refunded',
        amount: '300.00',
        currency: 'BOB',
        paymentMethod: 'card',
        merchantReference: 'ORDEN-REFUNDED-1003',
      });
    });
  });
});
