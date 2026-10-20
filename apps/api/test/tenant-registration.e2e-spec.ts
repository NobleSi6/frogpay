import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { ApiKeysController } from '../src/modules/identity/presentation/http/api-keys.controller';
import { TenantsController } from '../src/modules/identity/presentation/http/tenants.controller';
import { IdentityController } from '../src/modules/identity/presentation/http/identity.controller';
import { ActivateInvitationUseCase } from '../src/modules/identity/application/use-cases/activate-invitation.use-case';
import { CreateTenantUseCase } from '../src/modules/identity/application/use-cases/create-tenant.use-case';
import { GenerateApiKeyUseCase } from '../src/modules/identity/application/use-cases/generate-api-key.use-case';
import { ListApiKeysUseCase } from '../src/modules/identity/application/use-cases/list-api-keys.use-case';
import { ListTenantsUseCase } from '../src/modules/identity/application/use-cases/list-tenants.use-case';
import { LoginUseCase } from '../src/modules/identity/application/use-cases/login.use-case';
import { GetCurrentUserUseCase } from '../src/modules/identity/application/use-cases/get-current-user.use-case';
import { RegenerateApiKeyUseCase } from '../src/modules/identity/application/use-cases/regenerate-api-key.use-case';
import { RevokeApiKeyUseCase } from '../src/modules/identity/application/use-cases/revoke-api-key.use-case';
import { PaymentsController } from '../src/modules/payments/presentation/http/payments.controller';
import { ApiKeyAuthGuard } from '../src/modules/payments/presentation/guards/api-key-auth.guard';
import { CreatePaymentUseCase } from '../src/modules/payments/application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../src/modules/payments/application/use-cases/get-payment.use-case';
import { PrismaTenantContextService } from '../src/shared/database/prisma-tenant-context.service';
import { RolesGuard } from '../src/shared/auth/roles.guard';
import { CryptoUtil } from '../src/shared/utils/crypto.util';

describe('Tenant registration and API-key isolation (e2e)', () => {
  let app: INestApplication;
  const tenantId = 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b';
  const otherTenantId = '1b722a2b-00f2-47a1-b3df-71d156fb9451';
  const otherTenantPaymentId = '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391';
  const generatedKey = CryptoUtil.generateApiKey('test');
  const paymentApiKey = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    key_prefix: generatedKey.keyPrefix,
    secret_hash: generatedKey.keyHash,
    tenant_id: tenantId,
    environment: 'sandbox',
    status: 'active',
    expires_at: null,
  };

  const tenantResponse = {
    id: tenantId,
    name: 'Comercio E2E',
    taxId: '1028472023',
    contactEmail: 'owner@example.test',
    plan: 'free',
    status: 'active',
    owner: { userId: 'd3b07384-d113-4a6c-9c76-5a4d6f8e2e1a', email: 'owner@example.test', role: 'OWNER', status: 'invited' },
    invitationQueued: true,
    apiKeys: [],
    createdAt: '2026-10-18T12:00:00.000Z',
  };

  const prismaTenantContext = {
    withGlobalAccess: jest.fn(
      async (callback: (tx: { api_key: { findUnique: jest.Mock; update: jest.Mock } }) => Promise<unknown>) =>
        callback({
          api_key: {
            findUnique: jest.fn().mockResolvedValue(paymentApiKey),
            update: jest.fn().mockResolvedValue(paymentApiKey),
          },
        }),
    ),
  };

  const getPayment = {
    execute: jest.fn(async (requestedTenantId: string, paymentId: string) => {
      if (requestedTenantId !== otherTenantId || paymentId !== otherTenantPaymentId) {
        throw new NotFoundException({
          code: 'payment_not_found',
          message: 'El pago solicitado no fue encontrado.',
          details: null,
        });
      }
      return { id: paymentId, status: 'approved' };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantsController, IdentityController, ApiKeysController, PaymentsController],
      providers: [
        Reflector,
        RolesGuard,
        ApiKeyAuthGuard,
        { provide: CreateTenantUseCase, useValue: { execute: jest.fn().mockResolvedValue(tenantResponse) } },
        { provide: ListTenantsUseCase, useValue: { execute: jest.fn().mockResolvedValue([]) } },
        { provide: ActivateInvitationUseCase, useValue: { execute: jest.fn().mockResolvedValue({ message: 'Cuenta activada.' }) } },
        { provide: LoginUseCase, useValue: { execute: jest.fn() } },
        { provide: GetCurrentUserUseCase, useValue: { execute: jest.fn() } },
        {
          provide: GenerateApiKeyUseCase,
          useValue: {
            execute: jest.fn().mockResolvedValue({
              id: paymentApiKey.id,
              tenantId,
              name: 'Sandbox E2E',
              type: 'test',
              keyPrefix: generatedKey.keyPrefix,
              maskedKey: generatedKey.maskedKey,
              isActive: true,
              createdAt: new Date('2026-10-18T12:00:00.000Z'),
              rawKey: generatedKey.rawKey,
            }),
          },
        },
        { provide: ListApiKeysUseCase, useValue: { execute: jest.fn().mockResolvedValue([]) } },
        { provide: RevokeApiKeyUseCase, useValue: { execute: jest.fn() } },
        { provide: RegenerateApiKeyUseCase, useValue: { execute: jest.fn() } },
        { provide: CreatePaymentUseCase, useValue: { execute: jest.fn() } },
        { provide: GetPaymentUseCase, useValue: getPayment },
        { provide: PrismaTenantContextService, useValue: prismaTenantContext },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a tenant, activates its invitation, and creates a sandbox API key', async () => {
    const tenant = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('x-user-role', 'PLATFORM_ADMIN')
      .send({
        name: 'Comercio E2E',
        taxId: '1028472023',
        contactEmail: 'owner@example.test',
      })
      .expect(201);

    expect(tenant.body).toMatchObject({ id: tenantId, status: 'active' });

    const activation = await request(app.getHttpServer())
      .post('/api/identity/activate-invitation')
      .send({
        token: 'invitation-token-from-email-1234567890',
        email: 'owner@example.test',
        password: 'a-strong-password',
      })
      .expect(200);
    expect(activation.body.message).toContain('activada');

    const apiKey = await request(app.getHttpServer())
      .post(`/api/tenants/${tenantId}/api-keys`)
      .set('x-user-role', 'PLATFORM_ADMIN')
      .send({ name: 'Sandbox E2E', type: 'test' })
      .expect(201);

    expect(apiKey.body).toMatchObject({
      tenantId,
      type: 'test',
      rawKey: generatedKey.rawKey,
    });
  });

  it('does not let a tenant API key read a payment belonging to another tenant', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${otherTenantPaymentId}`)
      .set('X-Api-Key', generatedKey.rawKey)
      .expect(404);

    expect(getPayment.execute).toHaveBeenCalledWith(tenantId, otherTenantPaymentId);
  });
});
