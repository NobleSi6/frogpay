import { UnprocessableEntityException } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

describe('BankReconciliationService', () => {
  let service: BankReconciliationService;
  let mockPrisma: any;
  let withTenant: jest.Mock;

  const tenantId = '0e21495a-7a01-4dd7-8393-6c9cd724d752';
  const reference = 'BT-2026-A81F92';

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

  beforeEach(() => {
    mockPrisma = {
      bank_transaction: {
        findFirst: jest.fn(),
        create: jest.fn((args) =>
          Promise.resolve({ id: 'bt-uuid-1', ...args.data }),
        ),
      },
      payment: {
        findFirst: jest.fn(),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      payment_status_history: {
        create: jest.fn(() => Promise.resolve({})),
      },
      tenant_plan_usage: {
        upsert: jest.fn(() => Promise.resolve({})),
      },
      domain_event_outbox: {
        create: jest.fn(() => Promise.resolve({})),
      },
    };

    withTenant = jest.fn((tId, callback) => callback(mockPrisma));

    const tenantContext = {
      withTenant,
    } as unknown as PrismaTenantContextService;

    service = new BankReconciliationService(tenantContext);
  });

  describe('Conciliación Exacta (MATCH)', () => {
    it('debe aprobar el pago, calcular comisiones y emitir pago.aprobado', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-uuid-1',
        tenant_id: tenantId,
        provider_id: 'provider-bank',
        payment_method_id: 'method-bank',
        provider_transaction_id: reference,
        status: 'pending',
        amount: '150.00',
        currency: 'BOB',
        environment: 'sandbox',
        merchant_reference: 'ORDEN-1001',
        tenant: mockTenant,
      });

      const result = await service.reconcile({
        tenantId,
        depositId: 'DEP-100',
        reference,
        amount: '150.00',
        currency: 'BOB',
        bankName: 'Banco Ganadero',
      });

      expect(result.status).toBe('reconciled');
      expect(result.depositId).toBe('bt-uuid-1');
      expect(result.paymentId).toBe('pay-uuid-1');

      // 1. Pago actualizado a approved
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'pay-uuid-1',
            tenant_id: tenantId,
            provider_id: 'provider-bank',
            payment_method_id: 'method-bank',
            status: 'pending',
            environment: 'sandbox',
          },
          data: expect.objectContaining({
            status: 'approved',
            commission_amount: '5.75', // 150 * 0.035 + 0.50 = 5.25 + 0.50 = 5.75
            net_amount: '144.25',
            error_code: null,
          }),
        }),
      );
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            environment: 'sandbox',
            provider: {
              is: {
                payment_method: { is: { code: 'bank_transfer' } },
              },
            },
          }),
        }),
      );

      // 2. Transacción bancaria creada como reconciled
      expect(mockPrisma.bank_transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: tenantId,
            reference,
            amount: '150.00',
            status: 'reconciled',
            payment_id: 'pay-uuid-1',
          }),
        }),
      );

      // 3. Historial de estados
      expect(mockPrisma.payment_status_history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payment_id: 'pay-uuid-1',
            previous_status: 'pending',
            new_status: 'approved',
          }),
        }),
      );

      // 4. Consumo de plan incrementado
      expect(mockPrisma.tenant_plan_usage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            volume_used: { increment: 150 },
            tx_count: { increment: 1 },
          }),
        }),
      );

      // 5. Outbox pago.aprobado
      expect(mockPrisma.domain_event_outbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: 'pago.aprobado',
            aggregate_id: 'pay-uuid-1',
            payload: expect.objectContaining({
              paymentId: 'pay-uuid-1',
              amount: '150.00',
              commissionAmount: '5.75',
              netAmount: '144.25',
              providerTransactionId: reference,
            }),
          }),
        }),
      );
    });
  });

  describe('Monto Discrepante (amount_mismatch)', () => {
    it('debe rechazar el pago con amount_mismatch y emitir pago.rechazado', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-uuid-1',
        tenant_id: tenantId,
        provider_id: 'provider-bank',
        payment_method_id: 'method-bank',
        provider_transaction_id: reference,
        status: 'pending',
        amount: '150.00',
        currency: 'BOB',
        environment: 'sandbox',
        merchant_reference: 'ORDEN-1001',
        tenant: mockTenant,
      });

      const result = await service.reconcile({
        tenantId,
        depositId: 'DEP-200',
        reference,
        amount: '140.00', // Monto diferente
        currency: 'BOB',
        bankName: 'Banco Bisa',
      });

      expect(result.status).toBe('amount_mismatch');
      expect(result.depositId).toBe('bt-uuid-1');
      expect(result.paymentId).toBe('pay-uuid-1');
      expect(result.errorCode).toBe('amount_mismatch');

      // 1. Pago rechazado
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rejected',
            error_code: 'amount_mismatch',
          }),
        }),
      );

      // 2. Transacción bancaria registrada para revisión
      expect(mockPrisma.bank_transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'amount_mismatch',
            payment_id: 'pay-uuid-1',
          }),
        }),
      );

      // 3. Outbox pago.rechazado
      expect(mockPrisma.domain_event_outbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: 'pago.rechazado',
            payload: expect.objectContaining({
              paymentId: 'pay-uuid-1',
              errorCode: 'amount_mismatch',
              receivedAmount: '140.00',
            }),
          }),
        }),
      );
    });
  });

  describe('Referencia No Encontrada (reference_not_found)', () => {
    it('debe registrar el depósito como unmatched sin modificar pagos ni emitir eventos', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.reconcile({
        tenantId,
        depositId: 'DEP-300',
        reference: 'BT-UNKNOWN-999',
        amount: '150.00',
        currency: 'BOB',
        bankName: 'Banco Mercantil',
      });

      expect(result.status).toBe('unmatched');
      expect(result.errorCode).toBe('reference_not_found');
      expect(result.paymentId).toBeUndefined();

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.domain_event_outbox.create).not.toHaveBeenCalled();
      expect(mockPrisma.bank_transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'unmatched',
            payment_id: null,
            metadata: { reason: 'reference_not_found' },
          }),
        }),
      );
    });
  });

  describe('Transición Inválida (invalid_state_transition)', () => {
    it('registra el depósito y devuelve 422 si el pago ya no está en pending', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-uuid-1',
        tenant_id: tenantId,
        provider_id: 'provider-bank',
        payment_method_id: 'method-bank',
        provider_transaction_id: reference,
        status: 'approved', // Ya aprobado
        amount: '150.00',
        currency: 'BOB',
        tenant: mockTenant,
      });

      await expect(
        service.reconcile({
          tenantId,
          reference,
          amount: '150.00',
          currency: 'BOB',
          bankName: 'Banco Nacional',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockPrisma.bank_transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'unmatched',
            payment_id: 'pay-uuid-1',
          }),
        }),
      );
    });

    it('registra el depósito antes de devolver 422 si otra conciliación ganó la carrera', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-uuid-1',
        tenant_id: tenantId,
        provider_id: 'provider-bank',
        payment_method_id: 'method-bank',
        provider_transaction_id: reference,
        status: 'pending',
        amount: '150.00',
        currency: 'BOB',
        environment: 'sandbox',
        merchant_reference: 'ORDEN-1001',
        tenant: mockTenant,
      });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reconcile({
          tenantId,
          depositId: 'DEP-RACE-2',
          reference,
          amount: '150.00',
          currency: 'BOB',
          bankName: 'Banco Nacional',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockPrisma.bank_transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            external_id: 'DEP-RACE-2',
            status: 'unmatched',
            metadata: expect.objectContaining({
              reason: 'invalid_state_transition',
            }),
          }),
        }),
      );
      expect(mockPrisma.tenant_plan_usage.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.domain_event_outbox.create).not.toHaveBeenCalled();
    });
  });

  describe('Idempotencia de Depósito', () => {
    it('debe retornar la transacción previa sin duplicar procesamiento ni eventos', async () => {
      mockPrisma.bank_transaction.findFirst.mockResolvedValue({
        id: 'bt-existing-id',
        tenant_id: tenantId,
        external_id: 'DEP-IDEMPOTENT-1',
        status: 'reconciled',
        payment_id: 'pay-uuid-1',
        reference,
        amount: '150.00',
        currency: 'BOB',
      });

      const result = await service.reconcile({
        tenantId,
        depositId: 'DEP-IDEMPOTENT-1',
        reference,
        amount: '150.00',
        currency: 'BOB',
        bankName: 'Banco Ganadero',
      });

      expect(result.status).toBe('reconciled');
      expect(result.depositId).toBe('bt-existing-id');
      expect(result.paymentId).toBe('pay-uuid-1');

      // No debe buscar pago ni crear transacciones nuevamente
      expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.bank_transaction.create).not.toHaveBeenCalled();
      expect(mockPrisma.domain_event_outbox.create).not.toHaveBeenCalled();
    });

    it('rechaza reutilizar el depositId con datos diferentes', async () => {
      mockPrisma.bank_transaction.findFirst.mockResolvedValue({
        id: 'bt-existing-id',
        tenant_id: tenantId,
        external_id: 'DEP-IDEMPOTENT-1',
        status: 'reconciled',
        payment_id: 'pay-uuid-1',
        reference,
        amount: '150.00',
        currency: 'BOB',
      });

      await expect(
        service.reconcile({
          tenantId,
          depositId: 'DEP-IDEMPOTENT-1',
          reference: 'BT-OTHER-REF',
          amount: '150.00',
          currency: 'BOB',
          bankName: 'Banco Ganadero',
        }),
      ).rejects.toThrow(
        'El identificador del depósito ya fue utilizado con otros datos.',
      );
      expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Validación del depósito', () => {
    it('solo busca pagos sandbox por transferencia bancaria', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await service.reconcile({
        tenantId,
        reference,
        amount: '150.00',
        currency: 'BOB',
        bankName: 'Banco de Prueba',
      });

      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            environment: 'sandbox',
            provider: {
              is: {
                payment_method: { is: { code: 'bank_transfer' } },
              },
            },
          }),
        }),
      );
    });

    it('registra moneda discrepante sin aprobar ni rechazar el pago', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-uuid-1',
        tenant_id: tenantId,
        provider_id: 'provider-bank',
        payment_method_id: 'method-bank',
        provider_transaction_id: reference,
        status: 'pending',
        amount: '150.00',
        currency: 'USD',
        environment: 'sandbox',
        merchant_reference: 'ORDEN-1001',
        tenant: mockTenant,
      });

      const result = await service.reconcile({
        tenantId,
        depositId: 'DEP-CURRENCY-1',
        reference,
        amount: '150.00',
        currency: 'BOB',
        bankName: 'Banco de Prueba',
      });

      expect(result).toEqual({
        status: 'currency_mismatch',
        depositId: 'bt-uuid-1',
        paymentId: 'pay-uuid-1',
        errorCode: 'currency_mismatch',
      });
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.domain_event_outbox.create).not.toHaveBeenCalled();
      expect(mockPrisma.bank_transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'currency_mismatch',
            metadata: expect.objectContaining({
              expectedCurrency: 'USD',
              receivedCurrency: 'BOB',
            }),
          }),
        }),
      );
    });
  });
});
