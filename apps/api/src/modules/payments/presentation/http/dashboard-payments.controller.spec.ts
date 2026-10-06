import { BadRequestException, HttpStatus } from '@nestjs/common';
import { DashboardPaymentsController } from './dashboard-payments.controller';
import type { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import type { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { CreatePaymentDto } from '../../application/dto/create-payment.dto';
import type { PaymentResponseDto } from '../../application/dto/payment-response.dto';
import type { PaymentDetailsResponseDto } from '../../application/dto/payment-details.dto';

describe('DashboardPaymentsController', () => {
  let controller: DashboardPaymentsController;
  let createPaymentUseCase: jest.Mocked<Partial<CreatePaymentUseCase>>;
  let getPaymentUseCase: jest.Mocked<Partial<GetPaymentUseCase>>;

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
    providerTransactionId: 'pi_test123',
    errorCode: null,
    createdAt: '2026-10-01T14:32:10.000Z',
    updatedAt: '2026-10-01T14:32:11.000Z',
  };

  const sampleDetailsResponse: PaymentDetailsResponseDto = {
    ...sampleResponse,
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

  let mockResponse: any;

  beforeEach(() => {
    createPaymentUseCase = {
      execute: jest.fn(),
    };
    getPaymentUseCase = {
      execute: jest.fn(),
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
    };

    controller = new DashboardPaymentsController(
      createPaymentUseCase as CreatePaymentUseCase,
      getPaymentUseCase as GetPaymentUseCase,
    );
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
        controller.createTestPayment(authContext, 'not-a-uuid', validDto, mockResponse),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDetails', () => {
    it('returns payment details and timeline history for tenant in session', async () => {
      (getPaymentUseCase.execute as jest.Mock).mockResolvedValue(sampleDetailsResponse);

      const result = await controller.getDetails(authContext, validPaymentId);

      expect(getPaymentUseCase.execute).toHaveBeenCalledWith('tenant-456', validPaymentId);
      expect(result).toEqual(sampleDetailsResponse);
    });
  });
});
