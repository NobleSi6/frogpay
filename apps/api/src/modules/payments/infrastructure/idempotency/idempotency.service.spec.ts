import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import type { PaymentResponseDto } from '../../application/dto/payment-response.dto';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let redisMock: jest.Mocked<any>;

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
    // Mock de RedisService
    redisMock = {
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'error') {
          (redisMock.on as jest.Mock).mockImplementation(() => {
            // Emular que Redis no está disponible al inicio
          });
        }
      }),
      acquireIdempotencyLock: jest.fn(),
      saveIdempotencyResult: jest.fn(),
      releaseIdempotencyLock: jest.fn(),
    };

    service = new IdempotencyService(redisMock);
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

  it('acquires lock for a new request via Redis', async () => {
    redisMock.acquireIdempotencyLock.mockResolvedValue({
      acquired: true,
      isReplay: false,
    });

    const hash = service.computeCanonicalBodyHash(sampleBody);
    const result = await service.acquireLock(tenantId, environment, key, hash);

    expect(result).toEqual({ isReplay: false, acquired: true });
    expect(redisMock.acquireIdempotencyLock).toHaveBeenCalledWith(
      expect.stringContaining(`idempotency:${tenantId}:${environment}:${key}`),
      hash,
      60,
    );
  });

  it('throws 409 Conflict if another request is currently in PROCESSING with the same key', async () => {
    redisMock.acquireIdempotencyLock.mockResolvedValue({
      acquired: false,
      isReplay: false,
    });

    const hash = service.computeCanonicalBodyHash(sampleBody);

    await expect(service.acquireLock(tenantId, environment, key, hash)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 422 Unprocessable Entity if key is reused with a different body hash', async () => {
    redisMock.acquireIdempotencyLock.mockRejectedValue(
      new Error('idempotency_key_reused'),
    );

    const hash = service.computeCanonicalBodyHash(sampleBody);

    await expect(service.acquireLock(tenantId, environment, key, hash)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('returns stored response on idempotent replay with matching key and body hash', async () => {
    const responseJson = JSON.stringify(sampleResponse);
    redisMock.acquireIdempotencyLock.mockResolvedValue({
      acquired: false,
      isReplay: true,
      response: responseJson,
    });

    const hash = service.computeCanonicalBodyHash(sampleBody);
    const result = await service.acquireLock(tenantId, environment, key, hash);

    expect(result).toEqual({
      isReplay: true,
      response: sampleResponse,
    });
  });

  it('saves result to Redis with 24-hour TTL', async () => {
    redisMock.saveIdempotencyResult.mockResolvedValue(undefined);

    const hash = service.computeCanonicalBodyHash(sampleBody);
    await service.saveResult(tenantId, environment, key, hash, sampleResponse);

    expect(redisMock.saveIdempotencyResult).toHaveBeenCalledWith(
      expect.stringContaining(`idempotency:${tenantId}:${environment}:${key}`),
      hash,
      JSON.stringify(sampleResponse),
      86400, // 24 horas
    );
  });

  it('falls back to memory store when Redis is unavailable', async () => {
    // Simular fallo de Redis
    redisMock.acquireIdempotencyLock.mockRejectedValue(new Error('ECONNREFUSED'));

    const hash = service.computeCanonicalBodyHash(sampleBody);

    // Primera llamada falla en Redis y cae a memoria
    const result = await service.acquireLock(tenantId, environment, key, hash);
    expect(result).toEqual({ isReplay: false, acquired: true });

    // Segunda llamada concurrente en memoria debe retornar 409
    await expect(service.acquireLock(tenantId, environment, key, hash)).rejects.toThrow(
      ConflictException,
    );
  });

  it('releases lock on demand', async () => {
    redisMock.releaseIdempotencyLock.mockResolvedValue(undefined);

    const hash = service.computeCanonicalBodyHash(sampleBody);
    await service.acquireLock(tenantId, environment, key, hash);
    await service.releaseLock(tenantId, environment, key);

    expect(redisMock.releaseIdempotencyLock).toHaveBeenCalledWith(
      expect.stringContaining(`idempotency:${tenantId}:${environment}:${key}`),
    );
  });
});
