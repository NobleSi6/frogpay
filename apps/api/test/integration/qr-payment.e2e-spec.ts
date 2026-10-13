import { ValidationPipe } from '@nestjs/common';
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
import { PaymentSettlementService } from '../../src/modules/payments/application/use-cases/payment-settlement.service';
import { IdempotencyService } from '../../src/modules/payments/infrastructure/idempotency/idempotency.service';
import { RedisService } from '../../src/shared/cache/redis.service';
import { HttpExceptionFilter } from '../../src/shared/http/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../src/config/configuration';
import { validateEnvironment } from '../../src/config/env.validation';
import { PaymentsModule } from '../../src/modules/payments/payments.module';
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
process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '1';

type IntegrationFixture = {
  tenantId: string;
  planId: string;
  apiKey: string;
  jwt: string;
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
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.port !== '5432' ||
    database !== 'frogpay_test' ||
    username !== expectedUser ||
    /supabase/i.test(raw)
  ) {
    throw new Error(
      `La integración requiere frogpay_test local en localhost:5432 con el rol ${expectedUser}.`,
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
        create: jest.fn().mockResolvedValue({
          id: 'pi_local_integration',
          status: 'succeeded',
        }),
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
    const planName = `QR integration ${tenantId}`;
    const keyPrefix = `fp_test_${randomUUID().replaceAll('-', '').slice(0, 4)}`;
    const keySecret = randomUUID();
    const tenant = await adminPrisma.$transaction(async (tx) => {
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
      return { planId: plan.id, id: createdTenant.id };
    });
    const jwt = app.get(JwtTokenService).sign({
      id: randomUUID(),
      email: 'qr-integration@example.test',
      role: 'OWNER',
      tenantId,
    }).accessToken;
    fixture = {
      tenantId: tenant.id,
      planId: tenant.planId,
      apiKey: `${keyPrefix}.${keySecret}`,
      jwt,
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
          await tx.payment_status_history.deleteMany({
            where: { tenant_id: cleanupFixture.tenantId },
          });
          await tx.domain_event_outbox.deleteMany({
            where: { tenant_id: cleanupFixture.tenantId },
          });
          await tx.payment.deleteMany({ where: { tenant_id: cleanupFixture.tenantId } });
          await tx.tenant_plan_usage.deleteMany({
            where: { tenant_id: cleanupFixture.tenantId },
          });
          await tx.api_key.deleteMany({
            where: { tenant_id: cleanupFixture.tenantId },
          });
          await tx.tenant.delete({ where: { id: cleanupFixture.tenantId } });
          await tx.plan.delete({ where: { id: cleanupFixture.planId } });
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
    expect(mismatchedBody.status).toBe(500);
    expect(mismatchedBody.body.code).toBe('internal_error');

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
});
