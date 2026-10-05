import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import type { PaymentResponseDto } from '../../application/dto/payment-response.dto';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  const tenantId = 'tenant-123';
  const environment = 'sandbox';
  const key = '550e8400-e29b-41d4-a716-446655440000';

  const sampleBody = {
    amount: '150.00',
    currency: 'BOB',
    paymentMethod: 'card',
    merchantReference: 'orden-4471',
  };

  const sampleResponse: PaymentResponseDto = {
    id: 'pay-123',
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

  beforeEach(() => {
    service = new IdempotencyService();
  });

  it('computes deterministic canonical hash ignoring property ordering', () => {
    const hash1 = service.computeCanonicalBodyHash(sampleBody);
    const hash2 = service.computeCanonicalBodyHash({
      merchantReference: 'orden-4471',
      paymentMethod: 'card',
      amount: '150.00',
      currency: 'BOB',
    });

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('acquires lock for a new request', async () => {
    const hash = service.computeCanonicalBodyHash(sampleBody);
    const result = await service.acquireLock(tenantId, environment, key, hash);

    expect(result).toEqual({ isReplay: false });
  });

  it('throws 409 Conflict if another request is currently in PROCESSING with the same key', async () => {
    const hash = service.computeCanonicalBodyHash(sampleBody);
    await service.acquireLock(tenantId, environment, key, hash);

    await expect(service.acquireLock(tenantId, environment, key, hash)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 422 Unprocessable Entity if key is reused with a different body hash', async () => {
    const hash1 = service.computeCanonicalBodyHash(sampleBody);
    await service.acquireLock(tenantId, environment, key, hash1);
    await service.saveResult(tenantId, environment, key, hash1, sampleResponse);

    const hash2 = service.computeCanonicalBodyHash({
      ...sampleBody,
      amount: '200.00',
    });

    await expect(service.acquireLock(tenantId, environment, key, hash2)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('returns stored response on idempotent replay with matching key and body hash', async () => {
    const hash = service.computeCanonicalBodyHash(sampleBody);
    await service.acquireLock(tenantId, environment, key, hash);
    await service.saveResult(tenantId, environment, key, hash, sampleResponse);

    const result = await service.acquireLock(tenantId, environment, key, hash);

    expect(result).toEqual({
      isReplay: true,
      response: sampleResponse,
    });
  });

  it('allows re-acquiring lock after releaseLock is called', async () => {
    const hash = service.computeCanonicalBodyHash(sampleBody);
    await service.acquireLock(tenantId, environment, key, hash);
    await service.releaseLock(tenantId, environment, key);

    const result = await service.acquireLock(tenantId, environment, key, hash);
    expect(result).toEqual({ isReplay: false });
  });
});
