import { BadRequestException, HttpStatus } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import type { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';
import type { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import type { ApiKeyContext } from '../guards/api-key-auth.guard';
import type { CreatePaymentDto } from '../../application/dto/create-payment.dto';
import type { PaymentResponseDto } from '../../application/dto/payment-response.dto';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let createPaymentUseCase: jest.Mocked<Partial<CreatePaymentUseCase>>;
  let getPaymentUseCase: jest.Mocked<Partial<GetPaymentUseCase>>;

  const apiKeyContext: ApiKeyContext = {
    tenantId: 'tenant-123',
    environment: 'sandbox',
    apiKeyId: 'key-123',
    keyPrefix: 'fp_test_1234',
  };

  const validUuidKey = '550e8400-e29b-41d4-a716-446655440000';
  const validPaymentId = '6f1b2e34-5678-90ab-cdef-1234567890ab';

  const validDto: CreatePaymentDto = {
    amount: '150.00',
    currency: 'BOB',
    paymentMethod: 'card',
    merchantReference: 'orden-4471',
    paymentToken: 'pm_1Nk000000000000000000000',
  };

  const sampleResponse: PaymentResponseDto = {
    id: validPaymentId,
    status: 'approved',
    amount: '150.00',
    currency: 'BOB',
    paymentMethod: 'card',
    environment: 'sandbox',
    merchantReference: 'orden-4471',
    commissionAmount: '5.25',
    netAmount: '144.75',
    providerTransactionId: 'pi_test123',
    errorCode: null,
    createdAt: '2026-10-01T14:32:10.000Z',
    updatedAt: '2026-10-01T14:32:11.000Z',
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

    controller = new PaymentsController(
      createPaymentUseCase as CreatePaymentUseCase,
      getPaymentUseCase as GetPaymentUseCase,
    );
  });

  describe('create', () => {
    it('returns 201 Created on new payment', async () => {
      (createPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        isReplay: false,
        response: sampleResponse,
      });

      const result = await controller.create(apiKeyContext, validUuidKey, validDto, mockResponse);

      expect(createPaymentUseCase.execute).toHaveBeenCalledWith(
        'tenant-123',
        'sandbox',
        validUuidKey,
        validDto,
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toEqual(sampleResponse);
    });

    it('returns 200 OK on idempotent replay', async () => {
      (createPaymentUseCase.execute as jest.Mock).mockResolvedValue({
        isReplay: true,
        response: sampleResponse,
      });

      const result = await controller.create(apiKeyContext, validUuidKey, validDto, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual(sampleResponse);
    });

    it('rejects missing or non-UUID Idempotency-Key with 400 Bad Request', async () => {
      await expect(
        controller.create(apiKeyContext, 'invalid-key-not-uuid', validDto, mockResponse),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.create(apiKeyContext, undefined, validDto, mockResponse),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getById', () => {
    it('delegates to getPaymentUseCase when paymentId is a valid UUID', async () => {
      (getPaymentUseCase.execute as jest.Mock).mockResolvedValue(sampleResponse);

      const result = await controller.getById(apiKeyContext, validPaymentId);

      expect(getPaymentUseCase.execute).toHaveBeenCalledWith('tenant-123', validPaymentId);
      expect(result).toEqual(sampleResponse);
    });

    it('rejects invalid UUID with 400 Bad Request', async () => {
      await expect(controller.getById(apiKeyContext, 'non-uuid-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
