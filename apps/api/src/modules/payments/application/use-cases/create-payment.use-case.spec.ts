import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { CreatePaymentUseCase } from './create-payment.use-case';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import type { PaymentProviderPort } from '../../../provider-adapters/ports/payment-provider.port';
import type { CreatePaymentDto } from '../dto/create-payment.dto';

describe('CreatePaymentUseCase', () => {
  let useCase: CreatePaymentUseCase;
  let idempotency: IdempotencyService;
  let paymentProvider: jest.Mocked<PaymentProviderPort>;
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
    idempotency = new IdempotencyService();
    paymentProvider = {
      processPayment: jest.fn(),
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
      paymentProvider,
    );
  });

  it('successfully creates an approved payment with correct commission and outbox events', async () => {
    paymentProvider.processPayment.mockResolvedValue({
      status: 'approved',
      providerTransactionId: 'pi_test_1234',
      errorCode: null,
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
    paymentProvider.processPayment.mockResolvedValue({
      status: 'rejected',
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
    paymentProvider.processPayment.mockRejectedValue(new Error('Connection timeout to Stripe'));

    const result = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);

    expect(result.response.status).toBe('failed');
    expect(result.response.errorCode).toBe('provider_timeout');
    expect(outboxEvents[1].event_type).toBe('pago.fallido');
  });

  it('returns idempotent replay without calling payment provider a second time', async () => {
    paymentProvider.processPayment.mockResolvedValue({
      status: 'approved',
      providerTransactionId: 'pi_test_1234',
    });

    // Primera llamada
    await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);
    expect(paymentProvider.processPayment).toHaveBeenCalledTimes(1);

    // Segunda llamada idéntica (Replay)
    const replay = await useCase.execute(tenantId, 'sandbox', idempotencyKey, validDto);
    expect(replay.isReplay).toBe(true);
    expect(replay.response.status).toBe('approved');
    expect(paymentProvider.processPayment).toHaveBeenCalledTimes(1); // No vuelve a llamar
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
});
