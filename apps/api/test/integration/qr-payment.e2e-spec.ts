import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { CryptoUtil } from '../../src/shared/utils/crypto.util';
import { JwtTokenService } from '../../src/shared/auth/jwt-token.service';
import { AuthenticationGuard } from '../../src/shared/auth/authentication.guard';
import { RolesGuard } from '../../src/shared/auth/roles.guard';
import { PaymentQrExpirationJob } from '../../src/modules/payments/application/use-cases/payment-qr-expiration.job';
import { PaymentQrAutoConfirmJob } from '../../src/modules/simulators/application/payment-qr-auto-confirm.job';
import { PaymentSettlementService } from '../../src/modules/payments/application/use-cases/payment-settlement.service';
import { IdempotencyService } from '../../src/modules/payments/infrastructure/idempotency/idempotency.service';
import { RedisService } from '../../src/shared/cache/redis.service';
import { HttpExceptionFilter } from '../../src/shared/http/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../src/config/configuration';
import { validateEnvironment } from '../../src/config/env.validation';
import { PaymentsModule } from '../../src/modules/payments/payments.module';
import { SimulatorsModule } from '../../src/modules/simulators/simulators.module';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { DashboardModule } from '../../src/modules/dashboard/dashboard.module';
import { ProviderAdaptersModule } from '../../src/modules/provider-adapters/provider-adapters.module';
import { PrismaModule } from '../../src/shared/database/prisma.module';
import { RabbitMqEventBus } from '../../src/shared/events/rabbitmq-event-bus';
import { OutboxEventPublisher } from '../../src/shared/events/outbox-event-publisher.service';
import { STRIPE_CLIENT } from '../../src/modules/provider-adapters/adapters/stripe/stripe-client.provider';

jest.setTimeout(120000);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'frogpay-local-qr-integration-secret-32';
process.env.STRIPE_SECRET_KEY = 'sk_test_local_integration_only';
process.env.PAYMENT_MOCK_ADAPTER_ENABLED = 'false';
process.env.PAYMENT_PROVIDER_BINDINGS = '';
process.env.QR_EXPIRATION_JOB_ENABLED = 'true';
process.env.QR_EXPIRATION_JOB_INTERVAL_SECONDS = '3600';
process.env.QR_SIMULATORS_ENABLED = 'true';
process.env.QR_AUTO_CONFIRM_ENABLED = 'false';
process.env.QR_AUTO_CONFIRM_SECONDS = '10';
process.env.QR_AUTO_CONFIRM_INTERVAL_SECONDS = '3600';
process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '1';

type IntegrationFixture = {
  tenantId: string;
  planId: string;
  foreignTenantId: string;
  foreignPlanId: string;
  apiKey: string;
  productionApiKey: string;
  jwt: string;
  adminJwt: string;
};

function assertLocalDatabaseUrl(raw: string, expectedUser: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('La URL de integración de PostgreSQL no es válida.');
  }

  const database = parsed.pathname.replace(/^\/+/, '');
  const username = decodeURIComponent(parsed.username);
  const expectedPort = process.env.FROGPAY_TEST_DATABASE_PORT ?? '5432';
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.port !== expectedPort ||
    database !== 'frogpay_test' ||
    username !== expectedUser ||
    /supabase/i.test(raw)
  ) {
    throw new Error(
      `La integración requiere frogpay_test local en localhost:${expectedPort} con el rol ${expectedUser}.`,
    );
  }
}

describe('QR payment integration database guard', () => {
  it('aborts on an invented Supabase URL before any connector runs', () => {
    const connect = jest.fn();
    expect(() =>
      runWithDatabaseUrlGuard(
        'postgresql://frogpay_app@fake.supabase.invalid:5432/frogpay_test',
        connect,
      ),
    ).toThrow('La integración requiere frogpay_test local');
    expect(connect).not.toHaveBeenCalled();
  });
});

function runWithDatabaseUrlGuard(raw: string, connect: () => void): void {
  assertLocalDatabaseUrl(raw, 'frogpay_app');
  connect();
}

describe('QR payment integration (NestJS + local PostgreSQL)', () => {
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;
  let adminPrisma: PrismaClient | undefined;
  let cleanupPrisma: PrismaClient | undefined;
  let fixture: IntegrationFixture | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const directUrl = process.env.DIRECT_URL;
    if (!databaseUrl || !directUrl) {
      throw new Error('DATABASE_URL y DIRECT_URL son obligatorias para la integración.');
    }
    assertLocalDatabaseUrl(databaseUrl, 'frogpay_app');
    assertLocalDatabaseUrl(directUrl, 'frogpay_test');

    adminPrisma = new PrismaClient({
      datasources: { db: { url: directUrl } },
    });
    await adminPrisma.$connect();
    const adminRole = await adminPrisma.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user
    `;
    if (adminRole[0]?.current_user !== 'frogpay_test') {
      throw new Error('DIRECT_URL debe conectar como frogpay_test para fixtures y limpieza.');
    }
    if (!process.env.PGPASSWORD) {
      throw new Error('PGPASSWORD es necesaria para limpiar el historial append-only del test.');
    }
    const cleanupUrl = new URL(directUrl);
    cleanupUrl.username = 'postgres';
    cleanupUrl.password = process.env.PGPASSWORD;
    cleanupPrisma = new PrismaClient({
      datasources: { db: { url: cleanupUrl.toString() } },
    });
    await cleanupPrisma.$connect();
    const cleanupRole = await cleanupPrisma.$queryRaw<
      Array<{ current_user: string; rolsuper: boolean }>
    >`
      SELECT current_user, rol.rolsuper
      FROM pg_roles rol
      WHERE rol.rolname = current_user
    `;
    if (cleanupRole[0]?.current_user !== 'postgres' || !cleanupRole[0]?.rolsuper) {
      throw new Error('PGPASSWORD debe corresponder al superusuario postgres local.');
    }

    const redisStub = {
      status: 'end',
      on: jest.fn((event: string, callback: (error: Error) => void) => {
        if (event === 'error') callback(new Error('Redis deshabilitado en esta integración.'));
      }),
    };
    const eventBusStub = {
      subscribe: jest.fn(),
      publish: jest.fn(),
      publishAll: jest.fn(),
      checkHealth: jest.fn(),
    };
    const stripeClientStub = {
      paymentIntents: {
        create: jest.fn().mockImplementation(() => ({
          id: `pi_local_integration_${randomUUID().replaceAll('-', '')}`,
          status: 'succeeded',
        })),
        retrieve: jest.fn(),
      },
    };
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: [],
          load: [configuration],
          validate: validateEnvironment,
        }),
        PaymentsModule,
        IdentityModule,
        DashboardModule,
        SimulatorsModule,
        ProviderAdaptersModule,
        PrismaModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue(redisStub)
      .overrideProvider(RabbitMqEventBus)
      .useValue(eventBusStub)
      .overrideProvider(OutboxEventPublisher)
      .useValue({})
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripeClientStub)
      .compile();
    app = moduleRef.createNestApplication();
    const reflector = new Reflector();
    app.useGlobalGuards(
      new AuthenticationGuard(reflector, moduleRef.get(JwtTokenService)),
      new RolesGuard(reflector),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    if (Reflect.get(app.get(IdempotencyService), 'useMemoryFallback') !== true) {
      throw new Error('Redis no activó fallback en memoria.');
    }

    const tenantId = randomUUID();
    const foreignTenantId = randomUUID();
    const planName = `QR integration ${tenantId}`;
    const foreignPlanName = `QR integration foreign ${foreignTenantId}`;
    const keyPrefix = `fp_test_${randomUUID().replaceAll('-', '').slice(0, 4)}`;
    const keySecret = randomUUID();
    const productionKeyPrefix = `fp_live_${randomUUID().replaceAll('-', '').slice(0, 4)}`;
    const productionKeySecret = randomUUID();
    const tenantFixtures = await adminPrisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          name: planName,
          monthly_price: '0.00',
          commission_fixed: '0.50',
          commission_pct: '0.0350',
          monthly_volume_limit: null,
          features: {},
        },
      });
      const createdTenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: `QR Integration ${tenantId}`,
          business_name: `QR Integration ${tenantId}`,
          tax_id: `QR-${tenantId}`,
          contact_email: 'qr-integration@example.test',
          status: 'active',
          plan_id: plan.id,
        },
      });
      await tx.api_key.create({
        data: {
          tenant_id: tenantId,
          name: 'QR integration key',
          key_prefix: keyPrefix,
          secret_hash: CryptoUtil.hashString(keySecret),
          environment: 'sandbox',
          status: 'active',
          masked_key: `${keyPrefix}...`,
        },
      });
      await tx.api_key.create({
        data: {
          tenant_id: tenantId,
          name: 'QR integration production key',
          key_prefix: productionKeyPrefix,
          secret_hash: CryptoUtil.hashString(productionKeySecret),
          environment: 'production',
          status: 'active',
          masked_key: `${productionKeyPrefix}...`,
        },
      });

      const foreignPlan = await tx.plan.create({
        data: {
          name: foreignPlanName,
          monthly_price: '0.00',
          commission_fixed: '0.50',
          commission_pct: '0.0350',
          monthly_volume_limit: null,
          features: {},
        },
      });
      await tx.tenant.create({
        data: {
          id: foreignTenantId,
          name: `QR Integration ${foreignTenantId}`,
          business_name: `QR Integration ${foreignTenantId}`,
          tax_id: `QR-${foreignTenantId}`,
          contact_email: 'qr-integration-foreign@example.test',
          status: 'active',
          plan_id: foreignPlan.id,
        },
      });
      return {
        planId: plan.id,
        id: createdTenant.id,
        foreignPlanId: foreignPlan.id,
      };
    });
    const jwt = app.get(JwtTokenService).sign({
      id: randomUUID(),
      email: 'qr-integration@example.test',
      role: 'OWNER',
      tenantId,
    }).accessToken;
    const adminJwt = app.get(JwtTokenService).sign({
      id: randomUUID(),
      email: 'qr-integration-admin@example.test',
      role: 'ADMIN',
      tenantId,
    }).accessToken;
    fixture = {
      tenantId: tenantFixtures.id,
      planId: tenantFixtures.planId,
      foreignTenantId,
      foreignPlanId: tenantFixtures.foreignPlanId,
      apiKey: `${keyPrefix}.${keySecret}`,
      productionApiKey: `${productionKeyPrefix}.${productionKeySecret}`,
      jwt,
      adminJwt,
    };
  });

  afterAll(async () => {
    try {
      const cleanupFixture = fixture;
      if (cleanupFixture && cleanupPrisma) {
        await cleanupPrisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'ALTER TABLE public.payment_status_history DISABLE TRIGGER trg_psh_immutable',
          );
          const tenantIds = [cleanupFixture.tenantId, cleanupFixture.foreignTenantId];
          for (const tenantId of tenantIds) {
            await tx.payment_status_history.deleteMany({ where: { tenant_id: tenantId } });
            await tx.domain_event_outbox.deleteMany({ where: { tenant_id: tenantId } });
            await tx.payment.deleteMany({ where: { tenant_id: tenantId } });
            await tx.tenant_plan_usage.deleteMany({ where: { tenant_id: tenantId } });
            await tx.api_key.deleteMany({ where: { tenant_id: tenantId } });
            await tx.tenant.delete({ where: { id: tenantId } });
          }
          await tx.plan.deleteMany({
            where: { id: { in: [cleanupFixture.planId, cleanupFixture.foreignPlanId] } },
          });
          await tx.$executeRawUnsafe(
            'ALTER TABLE public.payment_status_history ENABLE TRIGGER trg_psh_immutable',
          );
        });
      }
    } finally {
      await app?.close();
      await adminPrisma?.$disconnect();
      await cleanupPrisma?.$disconnect();
    }
  });

  it('creates QR pending, replays idempotently, settles, expires, and keeps card working', async () => {
    const testApp = app;
    const testFixture = fixture;
    const sqlPrisma = adminPrisma;
    if (!testApp || !testFixture || !sqlPrisma) {
      throw new Error('La aplicación o el fixture no se inicializó.');
    }

    const qrKey = randomUUID();
    const qrRequest = {
      amount: '100.00',
      currency: 'BOB',
      paymentMethod: 'qr',
      merchantReference: 'qr-integration-order',
    };
    const qrResponse = await request(testApp.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${testFixture.jwt}`)
      .set('X-Api-Key', testFixture.apiKey)
      .set('Idempotency-Key', qrKey)
      .send(qrRequest)
      .expect(201);
    const qrBody = qrResponse.body as Record<string, unknown>;
    expect(qrBody.status).toBe('pending');
    expect(qrBody.paymentMethod).toBe('qr');
    expect(typeof qrBody.qrPayload).toBe('string');
    expect(typeof qrBody.expiresAt).toBe('string');
    expect(new Date(String(qrBody.expiresAt)).getTime()).toBeGreaterThan(Date.now());
    expect(Object.hasOwn(qrBody, 'paymentToken')).toBe(false);
    const qrPaymentId = String(qrBody.id);
    console.log(`QR_HTTP_201=${qrResponse.text}`);

    const dashboardResponse = await request(testApp.getHttpServer())
      .get(`/api/dashboard/payments/${qrPaymentId}`)
      .set('Authorization', `Bearer ${testFixture.jwt}`)
      .expect(200);
    expect(dashboardResponse.body.status).toBe('pending');
    expect(dashboardResponse.body.qrPayload).toBe(qrBody.qrPayload);
    expect(dashboardResponse.body.expiresAt).toBe(qrBody.expiresAt);
    console.log(`QR_DASHBOARD_PENDING=${dashboardResponse.text}`);

    const replay = await request(testApp.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${testFixture.jwt}`)
      .set('X-Api-Key', testFixture.apiKey)
      .set('Idempotency-Key', qrKey)
      .send(qrRequest)
      .expect(200);
    expect(Buffer.from(replay.text).equals(Buffer.from(qrResponse.text))).toBe(true);
    const duplicateCount = await sqlPrisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM payment
        WHERE tenant_id = ${testFixture.tenantId}::uuid AND idempotency_key = ${qrKey}
      `;
    expect(Number(duplicateCount[0]?.count)).toBe(1);
    console.log(
      `QR_IDEMPOTENCY=${JSON.stringify({ replayStatus: replay.status, bodyByteIdentical: true, paymentRows: Number(duplicateCount[0]?.count) })}`,
    );

    const mismatchedBody = await request(testApp.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${testFixture.jwt}`)
      .set('X-Api-Key', testFixture.apiKey)
      .set('Idempotency-Key', qrKey)
      .send({ ...qrRequest, amount: '101.00' });
    console.log(
      `QR_IDEMPOTENCY_MISMATCH=${JSON.stringify({ status: mismatchedBody.status, body: mismatchedBody.body })}`,
    );
    expect(mismatchedBody.status).toBe(422);
    expect(mismatchedBody.body.code).toBe('idempotency_key_reused');

    const settlement = testApp.get(PaymentSettlementService);
    await expect(settlement.approve(qrPaymentId)).resolves.toMatchObject({
      outcome: 'changed',
      status: 'approved',
    });
    const approved = await sqlPrisma.payment.findUniqueOrThrow({
      where: { id: qrPaymentId },
    });
    expect(approved.commission_amount?.toFixed(2)).toBe('4.00');
    expect(approved.net_amount?.toFixed(2)).toBe('96.00');
    const approvedEvents = await sqlPrisma.domain_event_outbox.findMany({
      where: {
        tenant_id: testFixture.tenantId,
        aggregate_id: qrPaymentId,
        event_type: 'pago.aprobado',
      },
      select: { payload: true },
    });
    expect(approvedEvents).toHaveLength(1);
    const approvedHistory = await sqlPrisma.payment_status_history.findMany({
      where: { tenant_id: testFixture.tenantId, payment_id: qrPaymentId },
      orderBy: { created_at: 'asc' },
      select: { previous_status: true, new_status: true },
    });
    expect(approvedHistory.map(({ new_status }) => new_status)).toEqual([
      'pending',
      'approved',
    ]);
    console.log(
      `QR_APPROVAL=${JSON.stringify({
        calculation: '100.00 * 0.0350 + 0.50 = 4.00; 100.00 - 4.00 = 96.00',
        commissionAmount: approved.commission_amount?.toFixed(2),
        netAmount: approved.net_amount?.toFixed(2),
        eventPayload: approvedEvents[0]?.payload,
        statusHistory: approvedHistory,
      })}`,
    );
    await expect(settlement.approve(qrPaymentId)).resolves.toMatchObject({
      outcome: 'unchanged',
      reason: 'not_pending',
    });
    const approvedEventCount = await sqlPrisma.domain_event_outbox.count({
      where: {
        tenant_id: testFixture.tenantId,
        aggregate_id: qrPaymentId,
        event_type: 'pago.aprobado',
      },
    });
    expect(approvedEventCount).toBe(1);

    const expiredPayment = await sqlPrisma.$transaction(async (tx) => {
      const method = await tx.payment_method.findUniqueOrThrow({ where: { code: 'qr' } });
      const provider = await tx.provider.findFirstOrThrow({
        where: { code: 'qr_local', is_active: true },
      });
      const payment = await tx.payment.create({
        data: {
          tenant_id: testFixture.tenantId,
          idempotency_key: randomUUID(),
          idempotency_body_hash: 'expired-qr-integration',
          amount: '20.00',
          currency: 'BOB',
          status: 'pending',
          payment_method_id: method.id,
          provider_id: provider.id,
          environment: 'sandbox',
          qr_payload: 'expired-qr-payload',
          expires_at: new Date(Date.now() - 60_000),
          merchant_reference: 'qr-expired-integration',
        },
      });
      await tx.payment_status_history.create({
        data: {
          payment_id: payment.id,
          tenant_id: testFixture.tenantId,
          previous_status: null,
          new_status: 'pending',
          metadata: {},
        },
      });
      return payment;
    });
    await testApp.get(PaymentQrExpirationJob).runOnce();
    const rejected = await sqlPrisma.payment.findUniqueOrThrow({
      where: { id: expiredPayment.id },
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.error_code).toBe('qr_expired');
    const expiredRejectedEvent = await sqlPrisma.domain_event_outbox.findFirstOrThrow({
      where: {
        tenant_id: testFixture.tenantId,
        aggregate_id: expiredPayment.id,
        event_type: 'pago.rechazado',
      },
      select: { payload: true },
    });
    expect(expiredRejectedEvent.payload).toMatchObject({ errorCode: 'qr_expired' });
    console.log(`QR_REJECTION=${JSON.stringify(expiredRejectedEvent.payload)}`);

    const cardResponse = await request(testApp.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${testFixture.jwt}`)
      .set('X-Api-Key', testFixture.apiKey)
      .set('Idempotency-Key', randomUUID())
      .send({
        amount: '12.00',
        currency: 'BOB',
        paymentMethod: 'card',
        merchantReference: 'card-integration-order',
        paymentToken: 'pm_test_local_card',
      })
      .expect(201);
    expect(cardResponse.body.status).toBe('approved');
    expect(cardResponse.body.paymentMethod).toBe('card');
    console.log(`CARD_HTTP_201=${cardResponse.text}`);

    const unknownKey = randomUUID();
    const unknownResponse = await request(testApp.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${testFixture.jwt}`)
      .set('X-Api-Key', testFixture.apiKey)
      .set('Idempotency-Key', unknownKey)
      .send({ ...qrRequest, paymentMethod: 'unknown_local' });
    console.log(
      `UNKNOWN_METHOD=${JSON.stringify({ status: unknownResponse.status, body: unknownResponse.body })}`,
    );
    expect(unknownResponse.status).toBe(422);
    expect(unknownResponse.body.code).toBe('validation_error');
    const unknownPaymentCount = await sqlPrisma.payment.count({
      where: { tenant_id: testFixture.tenantId, idempotency_key: unknownKey },
    });
    expect(unknownPaymentCount).toBe(0);
    console.log(`UNKNOWN_METHOD_PAYMENT_ROWS=${unknownPaymentCount}`);
  });

  it('simulates QR callbacks and dashboard actions and auto-confirms safely', async () => {
    const testApp = app;
    const testFixture = fixture;
    const sqlPrisma = adminPrisma;
    if (!testApp || !testFixture || !sqlPrisma) {
      throw new Error('La aplicación o el fixture no se inicializó.');
    }

    const http = request(testApp.getHttpServer());
    const config = testApp.get(ConfigService);
    const autoConfirm = testApp.get(PaymentQrAutoConfirmJob);
    const expiration = testApp.get(PaymentQrExpirationJob);
    const createQrPayment = async (merchantReference: string): Promise<string> => {
      const response = await http
        .post('/api/v1/payments')
        .auth(testFixture.jwt, { type: 'bearer' })
        .set('X-Api-Key', testFixture.apiKey)
        .set('Idempotency-Key', randomUUID())
        .send({
          amount: '25.00',
          currency: 'BOB',
          paymentMethod: 'qr',
          merchantReference,
        })
        .expect(201);
      return String(response.body.id);
    };
    const simulateDashboard = (
      paymentId: string,
      jwt: string,
      result: 'APPROVED' | 'FAILED',
    ) =>
      http
        .post(`/api/dashboard/payments/${paymentId}/simulate`)
        .auth(jwt, { type: 'bearer' })
        .send({ result });
    const simulateCallback = (
      paymentId: string,
      apiKey: string,
      result: 'APPROVED' | 'FAILED',
    ) =>
      http
        .post('/api/v1/test/simulators/qr-callback')
        .set('X-Api-Key', apiKey)
        .send({ payment_id: paymentId, result });
    const eventCount = (paymentId: string, eventType: string) =>
      sqlPrisma.domain_event_outbox.count({
        where: {
          tenant_id: testFixture.tenantId,
          aggregate_id: paymentId,
          event_type: eventType,
        },
      });

    const dashboardApprovedId = await createQrPayment('dashboard-simulator-approved');
    const unauthenticatedDashboard = await http
      .post(`/api/dashboard/payments/${dashboardApprovedId}/simulate`)
      .send({ result: 'APPROVED' });
    expect(unauthenticatedDashboard.status).toBe(401);
    expect(unauthenticatedDashboard.body.code).toBe('unauthorized');
    await simulateDashboard(dashboardApprovedId, testFixture.adminJwt, 'APPROVED').expect(403);
    const dashboardResult = await simulateDashboard(
      dashboardApprovedId,
      testFixture.jwt,
      'APPROVED',
    ).expect(200);
    expect(dashboardResult.body).toEqual({
      paymentId: dashboardApprovedId,
      status: 'approved',
      changed: true,
    });
    const dashboardGet = await http
      .get(`/api/dashboard/payments/${dashboardApprovedId}`)
      .auth(testFixture.jwt, { type: 'bearer' })
      .expect(200);
    expect(dashboardGet.body.status).toBe('approved');
    expect(dashboardGet.body.statusHistory.map((item: { newStatus: string }) => item.newStatus))
      .toEqual(['pending', 'approved']);
    expect(await eventCount(dashboardApprovedId, 'pago.aprobado')).toBe(1);
    console.log(`QR_SIMULATE_RESPONSE=${JSON.stringify(dashboardResult.body)}`);
    console.log(`QR_SIMULATE_GET=${JSON.stringify(dashboardGet.body)}`);

    const dashboardFailedId = await createQrPayment('dashboard-simulator-failed');
    const dashboardFailed = await simulateDashboard(
      dashboardFailedId,
      testFixture.jwt,
      'FAILED',
    ).expect(200);
    expect(dashboardFailed.body).toEqual({
      paymentId: dashboardFailedId,
      status: 'rejected',
      changed: true,
    });
    const failedPayment = await sqlPrisma.payment.findUniqueOrThrow({
      where: { id: dashboardFailedId },
    });
    expect(failedPayment.error_code).toBe('processing_error');
    expect(await eventCount(dashboardFailedId, 'pago.rechazado')).toBe(1);

    const callbackPaymentId = await createQrPayment('qr-callback-approved');
    const callbackWithoutKey = await http
      .post('/api/v1/test/simulators/qr-callback')
      .send({ payment_id: callbackPaymentId, result: 'APPROVED' });
    expect(callbackWithoutKey.status).toBe(401);
    expect(callbackWithoutKey.body.code).toBe('missing_api_key');

    const callbackFirst = await simulateCallback(
      callbackPaymentId,
      testFixture.apiKey,
      'APPROVED',
    ).expect(200);
    const callbackRepeat = await simulateCallback(
      callbackPaymentId,
      testFixture.apiKey,
      'APPROVED',
    ).expect(200);
    expect(callbackFirst.body).toEqual({
      paymentId: callbackPaymentId,
      status: 'approved',
      changed: true,
    });
    expect(callbackRepeat.body).toEqual({
      paymentId: callbackPaymentId,
      status: 'approved',
      changed: false,
    });
    expect(await eventCount(callbackPaymentId, 'pago.aprobado')).toBe(1);
    console.log(`QR_CALLBACK_FIRST=${JSON.stringify(callbackFirst.body)}`);
    console.log(`QR_CALLBACK_REPEAT=${JSON.stringify(callbackRepeat.body)}`);

    const callbackFailedId = await createQrPayment('qr-callback-failed');
    const callbackFailed = await simulateCallback(
      callbackFailedId,
      testFixture.apiKey,
      'FAILED',
    ).expect(200);
    expect(callbackFailed.body.status).toBe('rejected');
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: callbackFailedId } }))
        .error_code,
    ).toBe('processing_error');

    const foreignPaymentId = await createQrFixturePayment(
      sqlPrisma,
      testFixture.foreignTenantId,
      { environment: 'production' },
    );
    const foreignDashboard = await simulateDashboard(
      foreignPaymentId,
      testFixture.jwt,
      'APPROVED',
    );
    expect(foreignDashboard.status).toBe(404);
    expect(foreignDashboard.body.code).toBe('payment_not_found');
    const foreignCallback = await simulateCallback(
      foreignPaymentId,
      testFixture.apiKey,
      'APPROVED',
    );
    expect(foreignCallback.status).toBe(404);
    expect(foreignCallback.body.code).toBe('payment_not_found');

    const productionPaymentId = await createQrFixturePayment(
      sqlPrisma,
      testFixture.tenantId,
      { environment: 'production' },
    );
    const productionDashboard = await simulateDashboard(
      productionPaymentId,
      testFixture.jwt,
      'APPROVED',
    );
    expect(productionDashboard.status).toBe(403);
    expect(productionDashboard.body.code).toBe('simulation_not_allowed');
    const productionCallback = await simulateCallback(
      productionPaymentId,
      testFixture.productionApiKey,
      'APPROVED',
    );
    expect(productionCallback.status).toBe(403);
    expect(productionCallback.body.code).toBe('simulation_not_allowed');
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: productionPaymentId } }))
        .status,
    ).toBe('pending');

    const cardResponse = await http
      .post('/api/v1/payments')
      .auth(testFixture.jwt, { type: 'bearer' })
      .set('X-Api-Key', testFixture.apiKey)
      .set('Idempotency-Key', randomUUID())
      .send({
        amount: '12.00',
        currency: 'BOB',
        paymentMethod: 'card',
        merchantReference: 'card-before-auto-confirm',
        paymentToken: 'pm_test_local_card',
      })
      .expect(201);
    const cardUpdatedAt = await sqlPrisma.payment.findUniqueOrThrow({
      where: { id: String(cardResponse.body.id) },
      select: { updated_at: true },
    });
    expect(cardResponse.body.status).toBe('approved');

    const disabledWorkerId = await createQrPayment('qr-auto-confirm-disabled');
    await sqlPrisma.payment.update({
      where: { id: disabledWorkerId },
      data: { created_at: new Date(Date.now() - 20_000) },
    });
    config.set('qrAutoConfirmEnabled', false);
    await autoConfirm.runOnce();
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: disabledWorkerId } }))
        .status,
    ).toBe('pending');

    const matureWorkerId = await createQrPayment('qr-auto-confirm-mature');
    config.set('qrAutoConfirmEnabled', true);
    const productionWorkerId = await createQrFixturePayment(
      sqlPrisma,
      testFixture.tenantId,
      {
        environment: 'production',
        createdAt: new Date(Date.now() - 20_000),
      },
    );
    await autoConfirm.runOnce();
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: matureWorkerId } }))
        .status,
    ).toBe('pending');
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: productionWorkerId } }))
        .status,
    ).toBe('pending');
    await sqlPrisma.payment.update({
      where: { id: matureWorkerId },
      data: { created_at: new Date(Date.now() - 11_000) },
    });
    await autoConfirm.runOnce();
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: matureWorkerId } }))
        .status,
    ).toBe('approved');
    expect(await eventCount(matureWorkerId, 'pago.aprobado')).toBe(1);
    console.log(
      `QR_AUTO_CONFIRM=${JSON.stringify({
        beforeThreshold: 'pending',
        afterThreshold: 'approved',
        eventCount: await eventCount(matureWorkerId, 'pago.aprobado'),
      })}`,
    );

    const expiredPaymentId = await createQrFixturePayment(sqlPrisma, testFixture.tenantId, {
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 20_000),
    });
    const expiredSimulation = await simulateDashboard(
      expiredPaymentId,
      testFixture.jwt,
      'APPROVED',
    ).expect(200);
    expect(expiredSimulation.body).toEqual({
      paymentId: expiredPaymentId,
      status: 'pending',
      changed: false,
    });
    await Promise.all([autoConfirm.runOnce(), expiration.runOnce()]);
    const expiredFinal = await sqlPrisma.payment.findUniqueOrThrow({
      where: { id: expiredPaymentId },
    });
    expect(expiredFinal.status).toBe('rejected');
    expect(expiredFinal.error_code).toBe('qr_expired');
    expect(await eventCount(expiredPaymentId, 'pago.aprobado')).toBe(0);
    expect(await eventCount(expiredPaymentId, 'pago.rechazado')).toBe(1);

    const racePaymentId = await createQrPayment('qr-auto-confirm-callback-race');
    await sqlPrisma.payment.update({
      where: { id: racePaymentId },
      data: { created_at: new Date(Date.now() - 11_000) },
    });
    const [raceCallback] = await Promise.all([
      simulateCallback(racePaymentId, testFixture.apiKey, 'APPROVED'),
      autoConfirm.runOnce(),
    ]);
    expect(raceCallback.status).toBe(200);
    expect(raceCallback.body.status).toBe('approved');
    expect(
      (await sqlPrisma.payment.findUniqueOrThrow({ where: { id: racePaymentId } })).status,
    ).toBe('approved');
    expect(await eventCount(racePaymentId, 'pago.aprobado')).toBe(1);
    expect(await eventCount(disabledWorkerId, 'pago.aprobado')).toBe(1);
    expect(
      await sqlPrisma.payment.findUniqueOrThrow({
        where: { id: String(cardResponse.body.id) },
        select: { updated_at: true },
      }),
    ).toEqual(cardUpdatedAt);
    config.set('qrAutoConfirmEnabled', false);
  });

  it('verifies HTTP contract after transversal filter and API-key guard fixes', async () => {
    const testApp = app;
    const testFixture = fixture;
    const prisma = adminPrisma;
    if (!testApp || !testFixture || !prisma) {
      throw new Error('La aplicación o el fixture no se inicializó.');
    }

    const http = request(testApp.getHttpServer());
    const basePaymentBody = {
      amount: '31.00',
      currency: 'BOB',
      paymentMethod: 'qr',
      merchantReference: 'http-before-after-contract',
    };
    const postPayment = (options: {
      apiKey?: string;
      jwt?: string;
      key?: string;
      body?: Record<string, string>;
    }) => {
      let req = http.post('/api/v1/payments');
      if (options.apiKey) req = req.set('X-Api-Key', options.apiKey);
      if (options.jwt) req = req.auth(options.jwt, { type: 'bearer' });
      if (options.key) req = req.set('Idempotency-Key', options.key);
      return req.send(options.body ?? basePaymentBody);
    };
    const record = (name: string, response: { status: number; body: Record<string, unknown> }) => ({
      name,
      status: response.status,
      code: response.body.code ?? null,
    });
    const uniqueKey = () => randomUUID();
    const onlyApiKey = await postPayment({
      apiKey: testFixture.apiKey,
      key: uniqueKey(),
    });
    const noCredentials = await postPayment({ key: uniqueKey() });
    const jwtWithoutApiKey = await postPayment({
      jwt: testFixture.jwt,
      key: uniqueKey(),
    });
    const invalidApiKey = await postPayment({
      apiKey: 'fp_test_invalid.invalid-secret',
      key: uniqueKey(),
    });

    const reusedKey = uniqueKey();
    await postPayment({
      apiKey: testFixture.apiKey,
      jwt: testFixture.jwt,
      key: reusedKey,
    });
    const reusedBody = await postPayment({
      apiKey: testFixture.apiKey,
      jwt: testFixture.jwt,
      key: reusedKey,
      body: { ...basePaymentBody, amount: '32.00' },
    });

    const processingKey = uniqueKey();
    const idempotency = testApp.get(IdempotencyService);
    const bodyHash = idempotency.computeCanonicalBodyHash(basePaymentBody);
    await idempotency.acquireLock(
      testFixture.tenantId,
      'sandbox',
      processingKey,
      bodyHash,
    );
    const inProgress = await postPayment({
      apiKey: testFixture.apiKey,
      jwt: testFixture.jwt,
      key: processingKey,
    });

    const foreignPaymentId = await createQrFixturePayment(
      prisma,
      testFixture.foreignTenantId,
    );
    const productionPaymentId = await createQrFixturePayment(
      prisma,
      testFixture.tenantId,
      { environment: 'production' },
    );
    const dashboardNoJwt = await http
      .post(`/api/dashboard/payments/${productionPaymentId}/simulate`)
      .send({ result: 'APPROVED' });
    const dashboardAdmin = await http
      .post(`/api/dashboard/payments/${foreignPaymentId}/simulate`)
      .auth(testFixture.adminJwt, { type: 'bearer' })
      .send({ result: 'APPROVED' });
    const dashboardForeign = await http
      .post(`/api/dashboard/payments/${foreignPaymentId}/simulate`)
      .auth(testFixture.jwt, { type: 'bearer' })
      .send({ result: 'APPROVED' });
    const dashboardProduction = await http
      .post(`/api/dashboard/payments/${productionPaymentId}/simulate`)
      .auth(testFixture.jwt, { type: 'bearer' })
      .send({ result: 'APPROVED' });
    const callbackNoKey = await http
      .post('/api/v1/test/simulators/qr-callback')
      .send({ payment_id: productionPaymentId, result: 'APPROVED' });
    const callbackValidKey = await http
      .post('/api/v1/test/simulators/qr-callback')
      .set('X-Api-Key', testFixture.apiKey)
      .send({ payment_id: foreignPaymentId, result: 'APPROVED' });
    const callbackProduction = await http
      .post('/api/v1/test/simulators/qr-callback')
      .set('X-Api-Key', testFixture.productionApiKey)
      .send({ payment_id: productionPaymentId, result: 'APPROVED' });
    const missingPayment = await http
      .get(`/api/dashboard/payments/${uniqueKey()}`)
      .auth(testFixture.jwt, { type: 'bearer' });
    const dashboardPaymentNoJwt = await http
      .get(`/api/dashboard/payments/${String(onlyApiKey.body.id)}`);
    const dashboardPaymentMethodsNoJwt = await http.get('/api/dashboard/payment-methods');

    const httpContract = [
      record('payments_only_api_key', onlyApiKey),
      record('payments_no_credentials', noCredentials),
      record('payments_jwt_without_api_key', jwtWithoutApiKey),
      record('payments_invalid_api_key', invalidApiKey),
      record('idempotency_body_reused', reusedBody),
      record('idempotency_in_progress', inProgress),
      record('dashboard_simulate_no_jwt', dashboardNoJwt),
      record('dashboard_simulate_admin', dashboardAdmin),
      record('dashboard_simulate_foreign', dashboardForeign),
      record('dashboard_simulate_production', dashboardProduction),
      record('qr_callback_no_api_key', callbackNoKey),
      record('qr_callback_valid_api_key_foreign_payment', callbackValidKey),
      record('qr_callback_production_payment', callbackProduction),
      record('dashboard_get_missing_payment', missingPayment),
      record('dashboard_get_payment_no_jwt', dashboardPaymentNoJwt),
      record('dashboard_get_payment_methods_no_jwt', dashboardPaymentMethodsNoJwt),
    ];
    console.log(`HTTP_CONTRACT_AFTER=${JSON.stringify(httpContract)}`);
    console.log(`HTTP_JSON_EVIDENCE=${JSON.stringify({
      dashboardPaymentNoJwt: {
        status: dashboardPaymentNoJwt.status,
        body: dashboardPaymentNoJwt.body,
      },
      dashboardPaymentMethodsNoJwt: {
        status: dashboardPaymentMethodsNoJwt.status,
        body: dashboardPaymentMethodsNoJwt.body,
      },
      dashboardSimulationNoJwt: { status: dashboardNoJwt.status, body: dashboardNoJwt.body },
      dashboardSimulationAdmin: { status: dashboardAdmin.status, body: dashboardAdmin.body },
      dashboardForeignPayment: { status: dashboardForeign.status, body: dashboardForeign.body },
      paymentJwtWithoutApiKey: { status: jwtWithoutApiKey.status, body: jwtWithoutApiKey.body },
    })}`);
    expect(httpContract).toEqual([
      { name: 'payments_only_api_key', status: 201, code: null },
      { name: 'payments_no_credentials', status: 401, code: 'missing_api_key' },
      { name: 'payments_jwt_without_api_key', status: 401, code: 'missing_api_key' },
      { name: 'payments_invalid_api_key', status: 401, code: 'invalid_api_key' },
      { name: 'idempotency_body_reused', status: 422, code: 'idempotency_key_reused' },
      { name: 'idempotency_in_progress', status: 409, code: 'idempotency_in_progress' },
      { name: 'dashboard_simulate_no_jwt', status: 401, code: 'unauthorized' },
      { name: 'dashboard_simulate_admin', status: 403, code: 'forbidden' },
      { name: 'dashboard_simulate_foreign', status: 404, code: 'payment_not_found' },
      { name: 'dashboard_simulate_production', status: 403, code: 'simulation_not_allowed' },
      { name: 'qr_callback_no_api_key', status: 401, code: 'missing_api_key' },
      { name: 'qr_callback_valid_api_key_foreign_payment', status: 404, code: 'payment_not_found' },
      { name: 'qr_callback_production_payment', status: 403, code: 'simulation_not_allowed' },
      { name: 'dashboard_get_missing_payment', status: 404, code: 'payment_not_found' },
      { name: 'dashboard_get_payment_no_jwt', status: 401, code: 'unauthorized' },
      { name: 'dashboard_get_payment_methods_no_jwt', status: 401, code: 'unauthorized' },
    ]);
  });
});

async function createQrFixturePayment(
  prisma: PrismaClient,
  tenantId: string,
  options: {
    environment?: 'sandbox' | 'production';
    expiresAt?: Date;
    createdAt?: Date;
  } = {},
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const method = await tx.payment_method.findUniqueOrThrow({ where: { code: 'qr' } });
    const provider = await tx.provider.findFirstOrThrow({
      where: { code: 'qr_local', is_active: true },
    });
    const payment = await tx.payment.create({
      data: {
        tenant_id: tenantId,
        idempotency_key: randomUUID(),
        idempotency_body_hash: 'qr-simulator-integration-fixture',
        amount: '25.00',
        currency: 'BOB',
        status: 'pending',
        payment_method_id: method.id,
        provider_id: provider.id,
        environment: options.environment ?? 'sandbox',
        qr_payload: 'qr-simulator-fixture-payload',
        expires_at: options.expiresAt ?? new Date(Date.now() + 900_000),
        created_at: options.createdAt,
        merchant_reference: `qr-simulator-fixture-${randomUUID()}`,
      },
    });
    await tx.payment_status_history.create({
      data: {
        payment_id: payment.id,
        tenant_id: tenantId,
        previous_status: null,
        new_status: 'pending',
        metadata: {},
      },
    });
    return payment.id;
  });
}
