import {
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreatePaymentUseCase } from './create-payment.use-case';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';
import type { RedisService } from '../../../../shared/cache/redis.service';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import type { PaymentProviderPort } from '../../../provider-adapters/ports/payment-provider.port';
import type { PaymentProviderRegistry } from '../../../provider-adapters/registry/payment-provider.registry';
import { UnsupportedPaymentMethodError } from '../../../provider-adapters/registry/payment-provider.binding';
import type { CreatePaymentDto } from '../dto/create-payment.dto';
import { ValidationError } from '../../../../shared/http/errors/validation-error';

describe('CreatePaymentUseCase', () => {
  let useCase: CreatePaymentUseCase;
  let idempotency: IdempotencyService;
  let paymentProvider: jest.Mocked<PaymentProviderPort>;
  let paymentProviders: jest.Mocked<
    Pick<PaymentProviderRegistry, 'resolve' | 'capabilityOf'>
  >;
  let withTenant: jest.Mock;
  let transaction: {
    tenant: { findUnique: jest.Mock };
    tenant_plan_usage: { findUnique: jest.Mock; upsert: jest.Mock };
    payment: { create: jest.Mock; update: jest.Mock };
    payment_method: { findUnique: jest.Mock };
    provider: { findFirst: jest.Mock };
    payment_status_history: { create: jest.Mock };
    domain_event_outbox: { create: jest.Mock };
  };

  const tenantId = '0e21495a-7a01-4dd7-8393-6c9cd724d752';
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  const validDto: CreatePaymentDto = {
    amount: '100.00',
    currency: 'BOB',
    paymentMethod: 'card',
    merchantReference: 'orden-4471',
    paymentToken: 'pm_1Nk000000000000000000000',
  };

  const mockPlan = {
    id: 'plan-1',
    name: 'Free',
    commission_fixed: '0.50',
    commission_pct: '0.0350',
    monthly_volume_limit: '10000.00',
  };

  const mockTenant = {
    id: tenantId,
    name: 'Demo Tenant',
    plan: mockPlan,
  };

  const mockPaymentMethod = { id: 'pm-id-1', code: 'card', name: 'Tarjeta' };
  const mockProvider = { id: 'prov-id-1', code: 'stripe', payment_method_id: 'pm-id-1', is_active: true };

  let createdPayment: any;
  let outboxEvents: any[];
  let planUsage: any;

  beforeEach(() => {
    const records = new Map<
      string,
      { status: 'PROCESSING' | 'COMPLETED'; bodyHash: string; response?: string }
    >();
    const redis = {
      on: jest.fn(),
      acquireIdempotencyLock: jest.fn(async (key: string, bodyHash: string) => {
        const existing = records.get(key);
        if (existing?.status === 'PROCESSING') {
          return { acquired: false, isReplay: false };
        }
        if (existing?.status === 'COMPLETED') {
          if (existing.bodyHash !== bodyHash) {
            throw new Error('idempotency_key_reused');
          }
          return {
            acquired: false,
            isReplay: true,
            response: existing.response,
          };
        }
        records.set(key, { status: 'PROCESSING', bodyHash });
        return { acquired: true, isReplay: false };
      }),
      saveIdempotencyResult: jest.fn(
        async (key: string, bodyHash: string, response: string) => {
          records.set(key, { status: 'COMPLETED', bodyHash, response });
        },
      ),
      releaseIdempotencyLock: jest.fn(async (key: string) => {
        records.delete(key);
      }),
    } as unknown as RedisService;
    idempotency = new IdempotencyService(redis);
    paymentProvider = {
      metadata: {
        id: 'stripe',
        displayName: 'Stripe',
        methods: [],
      },
      authorize: jest.fn(),
      capture: jest.fn(),
      queryStatus: jest.fn(),
    };
    paymentProviders = {
      resolve: jest.fn().mockReturnValue(paymentProvider),
      capabilityOf: jest.fn().mockReturnValue({
        code: 'card',
        label: 'Tarjeta',
        processingMode: 'synchronous',
        requiresPaymentToken: true,
        fees: { fixedAmount: '0.30', variableBps: 290, currency: 'USD' },
      }),
    };

    createdPayment = {
      id: 'pay-uuid-1234',
      tenant_id: tenantId,
      amount: '100.00',
      currency: 'BOB',
      status: 'pending',
      created_at: new Date('2026-10-01T14:32:10.000Z'),
      updated_at: new Date('2026-10-01T14:32:10.000Z'),
    };
    outboxEvents = [];
    planUsage = null;

    transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(mockTenant),
      },
      tenant_plan_usage: {
        findUnique: jest.fn().mockImplementation(async () => planUsage),
        upsert: jest.fn().mockImplementation(async (args) => {
          planUsage = { ...args.create };
          return planUsage;
        }),
      },
      payment_method: {
        findUnique: jest.fn().mockResolvedValue(mockPaymentMethod),
      },
      provider: {
        findFirst: jest.fn().mockResolvedValue(mockProvider),
      },
      payment: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdPayment = { ...createdPayment, ...data };
          return createdPayment;
        }),
        update: jest.fn().mockImplementation(async (args) => {
          createdPayment = { ...createdPayment, ...args.data };
          return createdPayment;
        }),
      },
      payment_status_history: {
        create: jest.fn().mockResolvedValue({ id: 'psh-1' }),
      },
      domain_event_outbox: {
        create: jest.fn().mockImplementation(async (args) => {
          outboxEvents.push(args.data);
          return args.data;
        }),
      },
    };

    withTenant = jest.fn(async (_tenantId: string, callback: (tx: never) => Promise<unknown>) =>
      callback(transaction as never),
    );

    useCase = new CreatePaymentUseCase(
      { withTenant } as unknown as PrismaTenantContextService,
      idempotency,
      paymentProviders,
    );
  });

  it('rejects unsupported methods before acquiring a lock or opening a database transaction', async () => {
    paymentProviders.capabilityOf.mockImplementation(() => {
      throw new UnsupportedPaymentMethodError('unknown', ['card']);
    });
    const acquireLock = jest.spyOn(idempotency, 'acquireLock');

    await expect(
      useCase.execute(tenantId, 'sandbox', idempotencyKey, {
        ...validDto,
        paymentMethod: 'unknown',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(acquireLock).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
    expect(transaction.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a missing token when the selected capability requires one', async () => {
    await expect(
      useCase.execute(tenantId, 'sandbox', idempotencyKey, {
        ...validDto,
        paymentToken: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('processes a metadata capability without a token', async () => {
    paymentProviders.capabilityOf.mockReturnValue({
      code: 'mock',
      label: 'Mock',
      processingMode: 'synchronous',
      requiresPaymentToken: false,
      fees: { fixedAmount: '0.00', variableBps: 0, currency: 'BOB' },
    });
    transaction.payment_method.findUnique.mockResolvedValue({
      id: 'pm-mock',
      code: 'mock',
      name: 'Mock',
    });
    transaction.provider.findFirst.mockResolvedValue({
      id: 'provider-mock',
      code: 'mock',
      payment_method_id: 'pm-mock',
      is_active: true,
    });
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'mock-test-id',
    });

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, {
      ...validDto,
      paymentMethod: 'mock',
      paymentToken: undefined,
    });

    expect(result.response.status).toBe('approved');
    expect(paymentProviders.resolve).toHaveBeenCalledWith('mock');
    expect(paymentProvider.authorize).toHaveBeenCalledWith({
      amount: '100.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey,
    });
  });

  it('successfully creates an approved payment with correct commission and outbox events', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_1234',
    });

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    expect(result.isReplay).toBe(false);
    expect(result.response.status).toBe('approved');
    expect(result.response.amount).toBe('100.00');
    // Comisión = 100 * 0.035 + 0.50 = 4.00
    expect(result.response.commissionAmount).toBe('4.00');
    expect(result.response.netAmount).toBe('96.00');
    expect(result.response.providerTransactionId).toBe('pi_test_1234');

    // Comprobar eventos outbox generados
    expect(outboxEvents).toHaveLength(2);
    expect(outboxEvents[0].event_type).toBe('pago.creado');
    expect(outboxEvents[1].event_type).toBe('pago.aprobado');
    expect(outboxEvents[1].payload.commissionAmount).toBe('4.00');
  });

  it('processes a rejected payment with error_code and null commissions', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'declined',
      errorCode: 'card_declined',
      providerTransactionId: 'pi_test_declined',
    });

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    expect(result.response.status).toBe('rejected');
    expect(result.response.errorCode).toBe('card_declined');
    expect(result.response.commissionAmount).toBeNull();
    expect(result.response.netAmount).toBeNull();

    expect(outboxEvents[1].event_type).toBe('pago.rechazado');
    expect(outboxEvents[1].payload.errorCode).toBe('card_declined');
  });

  it('handles provider timeout gracefully by marking payment as failed and emitting pago.fallido', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'timeout',
      errorCode: 'provider_timeout',
    });

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    expect(result.response.status).toBe('failed');
    expect(result.response.errorCode).toBe('provider_timeout');
    expect(outboxEvents[1].event_type).toBe('pago.fallido');
  });

  it('returns idempotent replay without calling payment provider a second time', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_1234',
    });

    // Primera llamada
    await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);
    expect(paymentProvider.authorize).toHaveBeenCalledTimes(1);

    // Segunda llamada idéntica (Replay)
    const replay = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);
    expect(replay.isReplay).toBe(true);
    expect(replay.response.status).toBe('approved');
    expect(paymentProvider.authorize).toHaveBeenCalledTimes(1); // No vuelve a llamar
  });

  it('throws 429 when monthly volume limit is exceeded', async () => {
    planUsage = {
      tenant_id: tenantId,
      period: new Date().toISOString().slice(0, 7),
      volume_used: '9950.00',
    };

    await expect(
      useCase.execute(tenantId, 'sandbox', idempotencyKey, { ...validDto, amount: '100.00' }),
    ).rejects.toThrow(HttpException);
  });

  it('throws 409 Conflict when concurrent request with same idempotency key is in progress', async () => {
    paymentProvider.authorize.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ outcome: 'approved', providerTransactionId: 'pi_test' }), 100)),
    );

    // Primera llamada entra en PROCESSING
    const promise1 = useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    // Segunda llamada inmediata debe retornar 409
    await expect(
      useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto),
    ).rejects.toThrow(ConflictException);

    // Esperar a que termine la primera
    const result1 = await promise1;
    expect(result1.response.status).toBe('approved');
  });

  it('throws 422 Unprocessable Entity when idempotency key is reused with different body hash', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_1234',
    });

    // Primera llamada
    await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    // Segunda llamada con DIFERENTE monto (distinto body hash)
    await expect(
      useCase.execute(tenantId, 'sandbox', idempotencyKey, {
        ...validDto,
        amount: '200.00', // Diferente
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns same response on idempotent replay without creating duplicate payment record', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_1234',
    });

    // Primera llamada
    const result1 = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);
    expect(result1.isReplay).toBe(false);
    const paymentId1 = result1.response.id;

    // Segunda llamada (replay)
    const result2 = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);
    expect(result2.isReplay).toBe(true);
    expect(result2.response.id).toBe(paymentId1); // Mismo pago, sin duplicado

    // Provider fue llamado solo una vez
    expect(paymentProvider.authorize).toHaveBeenCalledTimes(1);
  });

  it('updates tenant_plan_usage only on approved payments', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_1234',
    });

    await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    // Verificar que se actualizó el plan_usage
    expect(planUsage).not.toBeNull();
    expect(planUsage.volume_used).toBe(100); // El monto se incrementó
    expect(planUsage.tx_count).toBe(1);
  });

  it('does NOT update tenant_plan_usage on rejected or failed payments', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'declined',
      errorCode: 'card_declined',
    });

    await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    // El plan_usage no debe cambiar
    expect(planUsage).toBeNull();
  });

  it('throws NotFoundException when tenant does not exist', async () => {
    withTenant.mockImplementation(async (tenantId: string, callback: (tx: never) => Promise<unknown>) => {
      const mockTx = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue(null), // Tenant no existe
        },
      };
      return callback(mockTx as never);
    });

    useCase = new CreatePaymentUseCase(
      { withTenant } as unknown as PrismaTenantContextService,
      idempotency,
      paymentProviders,
    );

    await expect(
      useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('generates three outbox events: pago.creado, pago.aprobado, and correct payload', async () => {
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_approved',
    });

    await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    // pago.creado
    expect(outboxEvents[0].event_type).toBe('pago.creado');
    expect(outboxEvents[0].aggregate_type).toBe('payment');
    expect(outboxEvents[0].tenant_id).toBe(tenantId);
    expect(outboxEvents[0].payload).toEqual({
      paymentId: createdPayment.id,
      amount: validDto.amount,
      currency: validDto.currency,
      paymentMethod: validDto.paymentMethod,
      environment: 'sandbox',
      merchantReference: validDto.merchantReference,
    });

    // pago.aprobado
    expect(outboxEvents[1].event_type).toBe('pago.aprobado');
    expect(outboxEvents[1].payload.providerTransactionId).toBe('pi_test_approved');
    expect(outboxEvents[1].payload.commissionAmount).toBe('4.00');
    expect(outboxEvents[1].payload.netAmount).toBe('96.00');
  });

  it('caches response in Redis for 24 hours after payment is completed', async () => {
    const saveSpy = jest.spyOn(idempotency, 'saveResult');

    paymentProvider.authorize.mockResolvedValue({
      outcome: 'approved',
      providerTransactionId: 'pi_test_cache',
    });

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    expect(saveSpy).toHaveBeenCalledWith(
      tenantId,
      'sandbox',
      idempotencyKey,
      expect.any(String), // bodyHash
      expect.objectContaining({
        id: result.response.id,
        status: 'approved',
      }),
    );

    saveSpy.mockRestore();
  });

  it('creates a bank_transfer payment with status pending and bankInstructions', async () => {
    paymentProviders.capabilityOf.mockReturnValue({
      code: 'bank_transfer',
      label: 'Transferencia bancaria',
      processingMode: 'asynchronous',
      requiresPaymentToken: false,
      fees: { fixedAmount: '1.00', variableBps: 100, currency: 'BOB' },
    });
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'pending',
      providerTransactionId: 'BT-2026-A81F92',
      expiresAt: new Date('2026-10-12T20:00:00.000Z'),
      bankInstructions: {
        bankName: 'Banco FrogPay Simulado',
        accountNumber: '10000012345',
        accountHolder: 'FrogPay Bolivia S.R.L.',
        amount: '150.00',
        currency: 'BOB',
        reference: 'BT-2026-A81F92',
      },
    });

    const bankDto: CreatePaymentDto = {
      amount: '150.00',
      currency: 'BOB',
      paymentMethod: 'bank_transfer',
      merchantReference: 'ORDEN-BT-101',
    };

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, bankDto);

    expect(result.response.status).toBe('pending');
    expect(result.response.bankInstructions?.reference).toBe('BT-2026-A81F92');
    expect(result.response.providerTransactionId).toBe('BT-2026-A81F92');
    expect(result.response.expiresAt).toBeDefined();
    expect(result.response.commissionAmount).toBeNull();
    expect(planUsage).toBeNull();
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0].event_type).toBe('pago.creado');
  });

  it('persists and caches pending QR payments without a token or final event', async () => {
    const qrPayload = '0002010102126304A1B2';
    const expiresAt = new Date('2026-10-10T18:45:00.000Z');
    paymentProviders.capabilityOf.mockReturnValue({
      code: 'qr',
      label: 'Billetera QR',
      processingMode: 'asynchronous',
      requiresPaymentToken: false,
      fees: { fixedAmount: '0.00', variableBps: 100, currency: 'BOB' },
    });
    transaction.payment_method.findUnique.mockResolvedValue({
      id: 'pm-qr',
      code: 'qr',
      name: 'QR interoperable',
    });
    transaction.provider.findFirst.mockResolvedValue({
      id: 'provider-qr-local',
      code: 'qr_local',
      payment_method_id: 'pm-qr',
      is_active: true,
    });
    paymentProvider.authorize.mockResolvedValue({
      outcome: 'pending',
      providerTransactionId: 'FP0123456789ABCDEF',
      qrPayload,
      expiresAt,
    });

    const qrDto: CreatePaymentDto = {
      amount: '100.00',
      currency: 'BOB',
      paymentMethod: 'qr',
      merchantReference: 'orden-qr-1',
    };
    const first = await useCase.execute(tenantId, 'sandbox', idempotencyKey, qrDto);
    const replay = await useCase.execute(tenantId, 'sandbox', idempotencyKey, qrDto);

    expect(first).toEqual({
      isReplay: false,
      response: expect.objectContaining({
        id: createdPayment.id,
        status: 'pending',
        paymentMethod: 'qr',
        providerTransactionId: 'FP0123456789ABCDEF',
        commissionAmount: null,
        netAmount: null,
        qrPayload,
        expiresAt: expiresAt.toISOString(),
      }),
    });
    expect(replay).toEqual({ isReplay: true, response: first.response });
    expect(transaction.payment.create).toHaveBeenCalledTimes(1);
    expect(transaction.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          provider_transaction_id: 'FP0123456789ABCDEF',
          qr_payload: qrPayload,
          expires_at: expiresAt,
        }),
      }),
    );
    expect(paymentProvider.authorize).toHaveBeenCalledTimes(1);
    expect(paymentProvider.authorize).toHaveBeenCalledWith({
      amount: '100.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey,
    });
    expect(transaction.payment_status_history.create).toHaveBeenCalledTimes(1);
    expect(outboxEvents.map(({ event_type }) => event_type)).toEqual(['pago.creado']);
    expect(planUsage).toBeNull();
  });
});
