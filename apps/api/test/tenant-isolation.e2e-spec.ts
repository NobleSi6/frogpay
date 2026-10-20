import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PaymentsController } from '../src/modules/payments/presentation/http/payments.controller';
import { ApiKeyAuthGuard } from '../src/modules/payments/presentation/guards/api-key-auth.guard';
import { GetPaymentUseCase } from '../src/modules/payments/application/use-cases/get-payment.use-case';
import { ListPaymentsUseCase } from '../src/modules/payments/application/use-cases/list-payments.use-case';
import { CreatePaymentUseCase } from '../src/modules/payments/application/use-cases/create-payment.use-case';
import { DashboardPaymentsController } from '../src/modules/payments/presentation/http/dashboard-payments.controller';
import { BankReconciliationService } from '../src/modules/payments/application/services/bank-reconciliation.service';
import { PrismaTenantContextService } from '../src/shared/database/prisma-tenant-context.service';
import { CryptoUtil } from '../src/shared/utils/crypto.util';
import { RolesGuard } from '../src/shared/auth/roles.guard';
import { Reflector } from '@nestjs/core';
import { ApiKeysController } from '../src/modules/identity/presentation/http/api-keys.controller';
import { ListApiKeysUseCase } from '../src/modules/identity/application/use-cases/list-api-keys.use-case';
import { GenerateApiKeyUseCase } from '../src/modules/identity/application/use-cases/generate-api-key.use-case';
import { RevokeApiKeyUseCase } from '../src/modules/identity/application/use-cases/revoke-api-key.use-case';
import { RegenerateApiKeyUseCase } from '../src/modules/identity/application/use-cases/regenerate-api-key.use-case';
import { WebhookDeliveriesController } from '../src/modules/webhooks/presentation/http/webhook-deliveries.controller';
import { WebhookDeliveriesService } from '../src/modules/webhooks/application/use-cases/webhook-deliveries.service';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  const tenantA = 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b';
  const tenantB = '1b722a2b-00f2-47a1-b3df-71d156fb9451';
  const paymentIdA = '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391';
  const paymentIdB = '7b3c9a12-e2fb-5a84-90af-75d618fe8402';
  const keyA = CryptoUtil.generateApiKey('test');
  const keyB = CryptoUtil.generateApiKey('test');
  const keysByPrefix = new Map([
    [keyA.keyPrefix, { key: keyA, tenantId: tenantA }],
    [keyB.keyPrefix, { key: keyB, tenantId: tenantB }],
  ]);

  const prismaTenantContext = {
    withGlobalAccess: jest.fn(
      async (callback: (tx: { api_key: { findUnique: jest.Mock; update: jest.Mock } }) => Promise<unknown>) =>
        callback({
          api_key: {
            findUnique: jest.fn(({ where }: { where: { key_prefix: string } }) => {
              const record = keysByPrefix.get(where.key_prefix);
              return record
                ? {
                    id: `key-${record.tenantId}`,
                    key_prefix: record.key.keyPrefix,
                    secret_hash: record.key.keyHash,
                    tenant_id: record.tenantId,
                    environment: 'sandbox',
                    status: 'active',
                    expires_at: null,
                  }
                : null;
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
    ),
  };

  const getPaymentUseCase = {
    execute: jest.fn(async (tenantId: string, id: string) => {
      if (tenantId === tenantA && id === paymentIdA) return { id, status: 'approved' };
      if (tenantId === tenantB && id === paymentIdB) return { id, status: 'pending' };
      throw new NotFoundException({
        code: 'payment_not_found',
        message: 'El pago solicitado no fue encontrado.',
        details: null,
      });
    }),
  };

  const listPaymentsUseCase = {
    execute: jest.fn(async (tenantId: string) => ({
      data: [{ id: tenantId === tenantA ? paymentIdA : paymentIdB, tenantId }],
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    })),
  };
  const listApiKeysUseCase = {
    execute: jest.fn(async (tenantId: string) => [
      {
        id: tenantId === tenantA ? paymentIdA : paymentIdB,
        tenantId,
        name: 'Sandbox',
        type: 'test',
        keyPrefix: 'fp_test_',
        maskedKey: 'fp_test_...1234',
        isActive: true,
        createdAt: new Date('2026-10-18T12:00:00.000Z'),
      },
    ]),
  };
  const webhookDeliveriesService = {
    list: jest.fn(async (tenantId: string) => ({
      data: [
        {
          id: tenantId === tenantA ? paymentIdA : paymentIdB,
          webhookId: 'cd88e9d8-7eec-4cca-a142-3946e19980ef',
          paymentId: tenantId === tenantA ? paymentIdA : paymentIdB,
          eventId: null,
          eventType: 'pago.aprobado',
          status: 'delivered',
          attemptCount: 1,
          responseCode: 200,
          lastError: null,
          nextRetryAt: null,
          deliveredAt: '2026-10-18T12:00:00.000Z',
          createdAt: '2026-10-18T12:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PaymentsController,
        DashboardPaymentsController,
        ApiKeysController,
        WebhookDeliveriesController,
      ],
      providers: [
        Reflector,
        RolesGuard,
        ApiKeyAuthGuard,
        { provide: CreatePaymentUseCase, useValue: { execute: jest.fn() } },
        { provide: GetPaymentUseCase, useValue: getPaymentUseCase },
        { provide: ListPaymentsUseCase, useValue: listPaymentsUseCase },
        { provide: BankReconciliationService, useValue: { reconcile: jest.fn() } },
        { provide: PrismaTenantContextService, useValue: prismaTenantContext },
        { provide: ListApiKeysUseCase, useValue: listApiKeysUseCase },
        { provide: GenerateApiKeyUseCase, useValue: { execute: jest.fn() } },
        { provide: RevokeApiKeyUseCase, useValue: { execute: jest.fn() } },
        { provide: RegenerateApiKeyUseCase, useValue: { execute: jest.fn() } },
        { provide: WebhookDeliveriesService, useValue: webhookDeliveriesService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string | string[] | undefined>; user?: { id: string; tenantId: string; role: string } }, _res: unknown, next: () => void) => {
      const requestedTenant = req.headers['x-test-tenant'];
      const tenantId = requestedTenant === tenantB ? tenantB : tenantA;
      req.user = { id: `user-${tenantId}`, tenantId, role: 'OWNER' };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 404 when tenant A reads tenant B payment and lists only its own payments', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentIdB}`)
      .set('X-Api-Key', keyA.rawKey)
      .expect(404);

    const response = await request(app.getHttpServer())
      .get('/api/dashboard/payments')
      .set('x-test-tenant', tenantA)
      .expect(200);

    expect(response.body.data).toEqual([{ id: paymentIdA, tenantId: tenantA }]);
    expect(getPaymentUseCase.execute).toHaveBeenCalledWith(tenantA, paymentIdB);
    expect(listPaymentsUseCase.execute).toHaveBeenCalledWith(tenantA, expect.any(Object));
  });

  it('uses tenant B context for B requests and cannot return tenant A payment data', async () => {
    const bPayment = await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentIdB}`)
      .set('X-Api-Key', keyB.rawKey)
      .expect(200);
    expect(bPayment.body).toMatchObject({ id: paymentIdB, status: 'pending' });

    const aPayment = await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentIdA}`)
      .set('X-Api-Key', keyB.rawKey)
      .expect(404);
    expect(aPayment.body.code).toBe('payment_not_found');
  });

  it('limits API-key and webhook-delivery lists to the authenticated tenant', async () => {
    const apiKeys = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantA}/api-keys`)
      .set('x-user-role', 'OWNER')
      .set('x-test-tenant', tenantB)
      .expect(200);
    expect(apiKeys.body).toHaveLength(1);
    expect(apiKeys.body[0].tenantId).toBe(tenantB);
    expect(listApiKeysUseCase.execute).toHaveBeenCalledWith(tenantB);

    const deliveries = await request(app.getHttpServer())
      .get('/api/dashboard/webhook-deliveries')
      .set('x-test-tenant', tenantB)
      .expect(200);
    expect(deliveries.body.data).toHaveLength(1);
    expect(deliveries.body.data[0].id).toBe(paymentIdB);
    expect(webhookDeliveriesService.list).toHaveBeenCalledWith(tenantB, expect.any(Object));
  });
});
