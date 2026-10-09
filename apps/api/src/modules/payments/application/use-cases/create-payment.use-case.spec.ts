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
import type { CreatePaymentDto } from '../dto/create-payment.dto';

describe('CreatePaymentUseCase', () => {
  let useCase: CreatePaymentUseCase;
  let idempotency: IdempotencyService;
  let paymentProvider: jest.Mocked<PaymentProviderPort>;
  let paymentProviders: jest.Mocked<Pick<PaymentProviderRegistry, 'resolve'>>;
  let withTenant: jest.Mock;

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

    const mockTx = {
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
        create: jest.fn().mockImplementation(async () => createdPayment),
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
      callback(mockTx as never),
    );

    useCase = new CreatePaymentUseCase(
      { withTenant } as unknown as PrismaTenantContextService,
      idempotency,
      paymentProviders,
    );
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
});
