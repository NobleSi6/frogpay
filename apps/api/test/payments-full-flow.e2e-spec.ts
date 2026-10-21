import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PaymentsController } from '../src/modules/payments/presentation/http/payments.controller';
import { SimulatorsController } from '../src/modules/payments/presentation/http/simulators.controller';
import { ProviderFaultController } from '../src/modules/simulators/presentation/http/provider-fault.controller';
import { ApiKeyAuthGuard } from '../src/modules/payments/presentation/guards/api-key-auth.guard';
import { CreatePaymentUseCase, CreatePaymentExecutionResult } from '../src/modules/payments/application/use-cases/create-payment.use-case';
import { GetPaymentUseCase } from '../src/modules/payments/application/use-cases/get-payment.use-case';
import { BankReconciliationService } from '../src/modules/payments/application/services/bank-reconciliation.service';
import { PrismaTenantContextService } from '../src/shared/database/prisma-tenant-context.service';
import { CryptoUtil } from '../src/shared/utils/crypto.util';
import { ProviderFaultInjector } from '../src/modules/provider-adapters/resilience/provider-fault-injector';
import { PaymentProviderRegistry } from '../src/modules/provider-adapters/registry/payment-provider.registry';
import type { CreatePaymentDto } from '../src/modules/payments/application/dto/create-payment.dto';
import type { PaymentResponseDto } from '../src/modules/payments/application/dto/payment-response.dto';
import type { GetPaymentResponseDto } from '../src/modules/payments/application/dto/get-payment-response.dto';

describe('Public payment flow (e2e)', () => {
  let app: INestApplication;
  const tenantId = 'e4c18495-e224-4b7d-8d87-6b5e7f9f3f2b';
  const apiKey = CryptoUtil.generateApiKey('test');
  const payments = new Map<string, PaymentResponseDto>();
  const idempotentResponses = new Map<string, { body: string; response: PaymentResponseDto }>();
  let nextId = 1;

  const prismaTenantContext = {
    withGlobalAccess: jest.fn(
      async (callback: (tx: { api_key: { findUnique: jest.Mock; update: jest.Mock } }) => Promise<unknown>) =>
        callback({
          api_key: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              key_prefix: apiKey.keyPrefix,
              secret_hash: apiKey.keyHash,
              tenant_id: tenantId,
              environment: 'sandbox',
              status: 'active',
              expires_at: null,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
    ),
  };

  const createPaymentUseCase = {
    execute: jest.fn(
      async (
        _tenant: string,
        environment: 'sandbox' | 'production',
        idempotencyKey: string,
        dto: CreatePaymentDto,
      ): Promise<CreatePaymentExecutionResult> => {
        const serialized = JSON.stringify(dto);
        const previous = idempotentResponses.get(idempotencyKey);
        if (previous) {
          if (previous.body !== serialized) throw new Error('Unexpected Idempotency-Key reuse in test fixture');
          return { isReplay: true, response: previous.response };
        }

        const id = `9e84723b-ec5f-4bb8-a665-00000000000${nextId++}`;
        const pending = dto.paymentMethod !== 'card';
        const response: PaymentResponseDto = {
          id,
          status: dto.paymentMethod === 'card' ? 'approved' : 'pending',
          amount: dto.amount,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          environment,
          merchantReference: dto.merchantReference,
          commissionAmount: pending ? null : '5.25',
          netAmount: pending ? null : '144.75',
          providerTransactionId: dto.paymentMethod === 'bank_transfer' ? `BT-${id.slice(-4)}` : `pi_${id.slice(-8)}`,
          errorCode: null,
          expiresAt: pending ? '2026-10-19T12:00:00.000Z' : null,
          bankInstructions:
            dto.paymentMethod === 'bank_transfer'
              ? {
                  bankName: 'Banco FrogPay Simulado',
                  accountNumber: '10000012345',
                  accountHolder: 'FrogPay Bolivia',
                  amount: dto.amount,
                  currency: dto.currency,
                  reference: `BT-${id.slice(-4)}`,
                }
              : null,
          qrPayload: dto.paymentMethod === 'qr' ? `000201010212-${id}` : null,
          createdAt: '2026-10-18T12:00:00.000Z',
          updatedAt: '2026-10-18T12:00:00.000Z',
        };
        payments.set(id, response);
        idempotentResponses.set(idempotencyKey, { body: serialized, response });
        return { isReplay: false, response };
      },
    ),
  };

  const getPaymentUseCase = {
    execute: jest.fn(async (_tenant: string, id: string): Promise<GetPaymentResponseDto> => {
      const payment = payments.get(id);
      if (!payment) throw new Error('Payment fixture not found');
      const depositConfirmed = payment.paymentMethod === 'bank_transfer' && payment.status === 'approved';
      return {
        ...payment,
        qrPayload: payment.status === 'pending' ? payment.qrPayload ?? null : null,
        bankInstructions: payment.status === 'pending' ? payment.bankInstructions ?? null : null,
        expiresAt: payment.expiresAt ?? null,
        transitions: [{ from: null, to: payment.status, createdAt: payment.createdAt, actor: depositConfirmed ? 'webhook' : 'system' }],
        statusHistory: [],
      };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController, SimulatorsController, ProviderFaultController],
      providers: [
        ApiKeyAuthGuard,
        { provide: CreatePaymentUseCase, useValue: createPaymentUseCase },
        { provide: GetPaymentUseCase, useValue: getPaymentUseCase },
        { provide: PrismaTenantContextService, useValue: prismaTenantContext },
        {
          provide: BankReconciliationService,
          useValue: {
            reconcile: jest.fn(async (input: { reference: string; depositId?: string }) => {
              const payment = [...payments.values()].find(
                (candidate) => candidate.providerTransactionId === input.reference,
              );
              if (payment) {
                payment.status = 'approved';
                payment.commissionAmount = '5.25';
                payment.netAmount = payment.amount === '150.00' ? '144.75' : payment.amount;
                payment.updatedAt = '2026-10-18T12:01:00.000Z';
              }
              return {
                status: 'reconciled',
                depositId: input.depositId ?? 'DEP-E2E-01',
                paymentId: payment?.id ?? null,
                errorCode: null,
              };
            }),
          },
        },
        {
          provide: ProviderFaultInjector,
          useValue: {
            inject: jest.fn(() => ({
              provider: 'stripe',
              mode: 'error',
              latencyMs: 0,
              until: new Date('2026-10-18T12:02:00.000Z'),
            })),
            list: jest.fn().mockReturnValue([]),
            clear: jest.fn(),
          },
        },
        {
          provide: PaymentProviderRegistry,
          useValue: { supportedAdapterCodes: jest.fn().mockReturnValue(['stripe']) },
        },
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

  const create = (method: 'card' | 'qr' | 'bank_transfer', idempotencyKey: string) =>
    request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('X-Api-Key', apiKey.rawKey)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        amount: '150.00',
        currency: 'BOB',
        paymentMethod: method,
        merchantReference: `order-${method}-e2e`,
        ...(method === 'card' ? { paymentToken: 'pm_e2e_payment_token' } : {}),
      });

  it('creates card payments with an accepted terminal result', async () => {
    const response = await create('card', '550e8400-e29b-41d4-a716-446655440001').expect(201);
    expect(['approved', 'rejected', 'failed']).toContain(response.body.status);
  });

  it('creates QR and bank-transfer payments pending with their method details', async () => {
    const qr = await create('qr', '550e8400-e29b-41d4-a716-446655440002').expect(201);
    expect(qr.body).toMatchObject({ status: 'pending', paymentMethod: 'qr' });
    expect(qr.body.qrPayload).toEqual(expect.any(String));

    const transfer = await create('bank_transfer', '550e8400-e29b-41d4-a716-446655440003').expect(201);
    expect(transfer.body).toMatchObject({ status: 'pending', paymentMethod: 'bank_transfer' });
    expect(transfer.body.bankInstructions).toMatchObject({ reference: expect.any(String), amount: '150.00' });
  });

  it('returns the full payment details, reconciles a deposit, and exposes sandbox provider faults', async () => {
    const transfer = await create('bank_transfer', '550e8400-e29b-41d4-a716-446655440004').expect(201);
    const details = await request(app.getHttpServer())
      .get(`/api/v1/payments/${transfer.body.id}`)
      .set('X-Api-Key', apiKey.rawKey)
      .expect(200);
    expect(details.body).toMatchObject({
      id: transfer.body.id,
      status: 'pending',
      paymentMethod: 'bank_transfer',
      bankInstructions: transfer.body.bankInstructions,
      transitions: expect.any(Array),
    });

    await request(app.getHttpServer())
      .post('/api/v1/test/simulators/bank-deposit')
      .set('X-Api-Key', apiKey.rawKey)
      .send({
        depositId: 'DEP-E2E-01',
        reference: transfer.body.providerTransactionId,
        amount: '150.00',
        currency: 'BOB',
        bankName: 'Banco de Prueba',
      })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'reconciled', paymentId: transfer.body.id }));

    const confirmed = await request(app.getHttpServer())
      .get(`/api/v1/payments/${transfer.body.id}`)
      .set('X-Api-Key', apiKey.rawKey)
      .expect(200);
    expect(confirmed.body.status).toBe('approved');

    await request(app.getHttpServer())
      .post('/api/v1/test/simulators/provider-fault')
      .set('X-Api-Key', apiKey.rawKey)
      .send({ provider: 'stripe', mode: 'error', durationSeconds: 30 })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ provider: 'stripe', mode: 'error' }));
  });

  it('replays the same payment for the same Idempotency-Key without creating another', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440005';
    const first = await create('card', key).expect(201);
    const retry = await create('card', key).expect(200);

    expect(retry.body).toEqual(first.body);
    expect(createPaymentUseCase.execute).toHaveBeenCalledTimes(6);
    expect(idempotentResponses.size).toBe(5);
    expect(idempotentResponses.get(key)?.response.id).toBe(first.body.id);
  });
});
