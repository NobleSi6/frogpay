import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { DashboardPaymentsController } from './dashboard-payments.controller';
import type { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import type { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import type { ListPaymentsUseCase } from '../../application/use-cases/list-payments.use-case';
import type { BankReconciliationService } from '../../application/services/bank-reconciliation.service';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { CreatePaymentDto } from '../../application/dto/create-payment.dto';
import type { PaymentResponseDto } from '../../application/dto/payment-response.dto';
import type { GetPaymentResponseDto } from '../../application/dto/get-payment-response.dto';
import type {
  ListPaymentsQueryDto,
  ListPaymentsResponseDto,
} from '../../application/dto/list-payments.dto';

describe('DashboardPaymentsController', () => {
  let controller: DashboardPaymentsController;
  let createPaymentUseCase: jest.Mocked<Partial<CreatePaymentUseCase>>;
  let getPaymentUseCase: jest.Mocked<Partial<GetPaymentUseCase>>;
  let listPaymentsUseCase: jest.Mocked<Partial<ListPaymentsUseCase>>;
  let bankReconciliationService: jest.Mocked<
    Partial<BankReconciliationService>
  >;
  let tenantContext: { withTenant: jest.Mock };

  const authContext: AuthenticatedTenantContext = {
    userId: 'user-123',
    role: 'OWNER',
    tenantId: 'tenant-456',
  };

  const validUuidKey = '550e8400-e29b-41d4-a716-446655440000';
  const validPaymentId = '6f1b2e34-5678-40ab-8def-1234567890ab';

  const validDto: CreatePaymentDto = {
    amount: '250.00',
    currency: 'BOB',
    paymentMethod: 'card',
    merchantReference: 'test-order-99',
    paymentToken: 'pm_1Nk000000000000000000000',
  };

  const sampleResponse: PaymentResponseDto = {
    id: validPaymentId,
    status: 'approved',
    amount: '250.00',
    currency: 'BOB',
    paymentMethod: 'card',
    environment: 'sandbox',
    merchantReference: 'test-order-99',
    commissionAmount: '8.75',
    netAmount: '241.25',
    providerTransactionId: 'BT-2026-REF1',
    errorCode: null,
    createdAt: '2026-10-01T14:32:10.000Z',
    updatedAt: '2026-10-01T14:32:11.000Z',
  };

  const sampleGetPaymentResponse: GetPaymentResponseDto = {
    ...sampleResponse,
    transitions: [
      {
        from: null,
        to: 'pending',
        createdAt: '2026-10-01T14:32:10.000Z',
        actor: 'system',
      },
      {
        from: 'pending',
        to: 'approved',
        createdAt: '2026-10-01T14:32:11.000Z',
        actor: 'webhook',
      },
    ],
    statusHistory: [
      {
        previousStatus: null,
        newStatus: 'pending',
        metadata: {},
        createdAt: '2026-10-01T14:32:10.000Z',
      },
      {
        previousStatus: 'pending',
        newStatus: 'approved',
        metadata: {},
        createdAt: '2026-10-01T14:32:11.000Z',
      },
    ],
  };

  const sampleWebhookDelivery = {
    id: 'f7e9fbaa-ef25-4a1e-9e88-c9f55a4bf5c4',
    webhook_id: 'cd88e9d8-7eec-4cca-a142-3946e19980ef',
    payment_id: validPaymentId,
    tenant_id: 'tenant-456',
    status: 'delivered',
    attempt_count: 1,
    delivered_at: new Date('2026-10-01T14:32:15.000Z'),
    next_retry_at: null,
    created_at: new Date('2026-10-01T14:32:12.000Z'),
    updated_at: new Date('2026-10-01T14:32:15.000Z'),
  };

  let mockResponse: any;

  beforeEach(() => {
    createPaymentUseCase = {
      execute: jest.fn(),
    };
    getPaymentUseCase = {
      execute: jest.fn(),
    };
    listPaymentsUseCase = {
      execute: jest.fn(),
    };
    bankReconciliationService = {
      reconcile: jest.fn(),
    };
    tenantContext = {
      withTenant: jest.fn(
        async (_tenantId: string, callback: (tx: any) => Promise<unknown>) => {
          const mockTx = {
            webhook_delivery: {
              findMany: jest.fn().mockResolvedValue([sampleWebhookDelivery]),
            },
          };
          return callback(mockTx);
        },
      ),
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
    };

    controller = new DashboardPaymentsController(
      createPaymentUseCase as CreatePaymentUseCase,
      getPaymentUseCase as GetPaymentUseCase,
      listPaymentsUseCase as ListPaymentsUseCase,
      bankReconciliationService as BankReconciliationService,
      tenantContext as unknown as PrismaTenantContextService,
    );
  });

  describe('listPayments', () => {
    it('delegates to listPaymentsUseCase with tenantId from JWT session context', async () => {
      const mockResult: ListPaymentsResponseDto = {
        data: [sampleResponse],
        page: 1,
        limit: 25,
        total: 1,
        totalPages: 1,
      };
      (listPaymentsUseCase.execute as jest.Mock).mockResolvedValue(mockResult);

      const query: ListPaymentsQueryDto = {
        page: 1,
        limit: 25,
        status: 'approved',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      const result = await controller.listPayments(authContext, query);

      expect(listPaymentsUseCase.execute).toHaveBeenCalledWith(
        'tenant-456',
        query,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('createTestPayment', () => {
    it('forces sandbox environment and delegates to createPaymentUseCase with session tenantId', async () => {
      (createPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        isReplay: false,
        response: sampleResponse,
      });

      const result = await controller.createTestPayment(
        authContext,
        validUuidKey,
        validDto,
        mockResponse,
      );

      expect(createPaymentUseCase.execute).toHaveBeenCalledWith(
        'tenant-456',
        'sandbox',
        validUuidKey,
        validDto,
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toEqual(sampleResponse);
    });

    it('rejects invalid UUID Idempotency-Key with 400 Bad Request', async () => {
      await expect(
        controller.createTestPayment(
          authContext,
          'not-a-uuid',
          validDto,
          mockResponse,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a QR payment request without a payment token', async () => {
      const qrResponse: PaymentResponseDto = {
        ...sampleResponse,
        status: 'pending',
        paymentMethod: 'qr',
        commissionAmount: null,
        netAmount: null,
        providerTransactionId: 'FP0123456789ABCDEF',
        qrPayload: '0002010102126304A1B2',
        expiresAt: '2026-10-10T18:45:00.000Z',
      };
      (createPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        isReplay: false,
        response: qrResponse,
      });
      const qrDto: CreatePaymentDto = {
        amount: '250.00',
        currency: 'BOB',
        paymentMethod: 'qr',
        merchantReference: 'test-order-qr',
      };

      const result = await controller.createTestPayment(
        authContext,
        validUuidKey,
        qrDto,
        mockResponse,
      );

      expect(createPaymentUseCase.execute).toHaveBeenCalledWith(
        'tenant-456',
        'sandbox',
        validUuidKey,
        qrDto,
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toEqual(qrResponse);
    });
  });

  describe('getDetails', () => {
    it('returns payment details enriched with sanitized webhook deliveries', async () => {
      (getPaymentUseCase.execute as jest.Mock).mockResolvedValue(
        sampleGetPaymentResponse,
      );

      const result = await controller.getDetails(authContext, validPaymentId);

      expect(getPaymentUseCase.execute).toHaveBeenCalledWith(
        'tenant-456',
        validPaymentId,
      );
      expect(result.id).toBe(validPaymentId);
      expect(result.webhookDeliveries).toHaveLength(1);
      expect(result.webhookDeliveries[0]).toEqual({
        id: sampleWebhookDelivery.id,
        webhookId: sampleWebhookDelivery.webhook_id,
        status: 'delivered',
        attemptCount: 1,
        lastAttemptAt: '2026-10-01T14:32:15.000Z',
        nextAttemptAt: null,
        createdAt: '2026-10-01T14:32:12.000Z',
      });
    });

    it('throws BadRequestException if payment ID is not a valid UUID', async () => {
      await expect(
        controller.getDetails(authContext, 'invalid-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('simulateDeposit', () => {
    it('ejecuta conciliación simulada para pago en sandbox con modo exact', async () => {
      (getPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        ...sampleGetPaymentResponse,
        environment: 'sandbox',
        paymentMethod: 'bank_transfer',
        providerTransactionId: 'BT-2026-REF1',
        amount: '150.00',
        currency: 'BOB',
      });

      (bankReconciliationService.reconcile as jest.Mock).mockResolvedValue({
        status: 'reconciled',
        depositId: 'dep-1',
        paymentId: validPaymentId,
      });

      const result = await controller.simulateDeposit(
        authContext,
        validPaymentId,
        {
          mode: 'exact',
        },
      );

      expect(result.status).toBe('reconciled');
      expect(bankReconciliationService.reconcile).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-456',
          reference: 'BT-2026-REF1',
          amount: '150.00',
          currency: 'BOB',
        }),
      );
    });

    it('rechaza con ForbiddenException si el pago es de producción', async () => {
      (getPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        ...sampleGetPaymentResponse,
        environment: 'production',
      });

      await expect(
        controller.simulateDeposit(authContext, validPaymentId, {
          mode: 'exact',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza simular un depósito para un método distinto de transferencia', async () => {
      (getPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        ...sampleGetPaymentResponse,
        environment: 'sandbox',
        paymentMethod: 'card',
      });

      await expect(
        controller.simulateDeposit(authContext, validPaymentId, {
          mode: 'exact',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(bankReconciliationService.reconcile).not.toHaveBeenCalled();
    });
  });
});
