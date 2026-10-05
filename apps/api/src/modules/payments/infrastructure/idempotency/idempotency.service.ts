import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { RedisService } from '../../../shared/cache/redis.service';
import type { PaymentResponseDto } from '../../application/dto/payment-response.dto';

export interface StoredIdempotencyRecord {
  status: 'PROCESSING' | 'COMPLETED';
  bodyHash: string;
  response?: PaymentResponseDto;
  expiresAt: number;
}

export type AcquireLockResult =
  | { isReplay: false; acquired: boolean }
  | { isReplay: true; response: PaymentResponseDto };

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  // Fallback en memoria cuando Redis no está disponible
  private readonly memoryStore = new Map<string, StoredIdempotencyRecord>();
  private useMemoryFallback = false;

  constructor(private readonly redis: RedisService) {
    // Escuchar errores de Redis para activar fallback
    this.redis.on('error', () => {
      if (!this.useMemoryFallback) {
        this.logger.warn('Redis unavailable, switching to memory fallback for idempotency');
        this.useMemoryFallback = true;
      }
    });

    this.redis.on('connect', () => {
      this.useMemoryFallback = false;
      this.logger.log('Redis connected, using Redis for idempotency');
    });
  }

  /**
   * Calcula el hash canónico del cuerpo excluyendo paymentToken.
   * Ordena las claves alfabéticamente para que el orden de las propiedades no altere el hash.
   */
  public computeCanonicalBodyHash(body: {
    amount: string;
    currency: string;
    paymentMethod: string;
    merchantReference: string;
  }): string {
    const canonicalObject = {
      amount: String(body.amount).trim(),
      currency: String(body.currency).trim().toUpperCase(),
      merchantReference: String(body.merchantReference).trim(),
      paymentMethod: String(body.paymentMethod).trim().toLowerCase(),
    };

    const canonicalString = JSON.stringify(canonicalObject, Object.keys(canonicalObject).sort());
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Intenta reclamar de forma atómica la clave de idempotencia.
   * - Si está en PROCESSING -> 409 Conflict (idempotency_in_progress)
   * - Si está en COMPLETED con hash distinto -> 422 Unprocessable Entity (idempotency_key_reused)
   * - Si está en COMPLETED con mismo hash -> Devuelve la respuesta guardada (Replay idempotente)
   * - Si es nueva -> Adquiere el lock con TTL de 60 segundos
   */
  public async acquireLock(
    tenantId: string,
    environment: string,
    key: string,
    bodyHash: string,
  ): Promise<AcquireLockResult> {
    const redisKey = this.formatKey(tenantId, environment, key);

    if (!this.useMemoryFallback) {
      return this.acquireLockWithRedis(redisKey, bodyHash);
    }

    return this.acquireLockWithMemory(redisKey, bodyHash);
  }

  private async acquireLockWithRedis(
    redisKey: string,
    bodyHash: string,
  ): Promise<AcquireLockResult> {
    try {
      const result = await this.redis.acquireIdempotencyLock(redisKey, bodyHash, 60);

      if (result.isReplay && result.response) {
        const response = JSON.parse(result.response) as PaymentResponseDto;
        return { isReplay: true, response };
      }

      if (!result.acquired && !result.isReplay) {
        // Otro proceso está procesando
        throw new ConflictException({
          code: 'idempotency_in_progress',
          message: 'Ya existe una solicitud en proceso con esta clave de idempotencia.',
          details: null,
        });
      }

      return { isReplay: false, acquired: true };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Error && error.message === 'idempotency_key_reused') {
        throw new UnprocessableEntityException({
          code: 'idempotency_key_reused',
          message: 'Esta clave de idempotencia ya se usó con una solicitud distinta.',
          details: null,
        });
      }
      // Error de Redis, cambiar a fallback
      this.logger.warn('Redis error in acquireLock, switching to memory fallback');
      this.useMemoryFallback = true;
      return this.acquireLockWithMemory(redisKey, bodyHash);
    }
  }

  private acquireLockWithMemory(
    redisKey: string,
    bodyHash: string,
  ): AcquireLockResult {
    const now = Date.now();
    const ttlMs = 60 * 1000; // 60 segundos para PROCESSING

    const existing = this.getValidRecord(redisKey, now);

    if (existing) {
      if (existing.status === 'PROCESSING') {
        throw new ConflictException({
          code: 'idempotency_in_progress',
          message: 'Ya existe una solicitud en proceso con esta clave de idempotencia.',
          details: null,
        });
      }

      if (existing.status === 'COMPLETED') {
        if (existing.bodyHash !== bodyHash) {
          throw new UnprocessableEntityException({
            code: 'idempotency_key_reused',
            message: 'Esta clave de idempotencia ya se usó con una solicitud distinta.',
            details: null,
          });
        }

        if (existing.response) {
          return { isReplay: true, response: existing.response };
        }
      }
    }

    // Adquirir lock temporal con TTL de 60 segundos
    this.memoryStore.set(redisKey, {
      status: 'PROCESSING',
      bodyHash,
      expiresAt: now + ttlMs,
    });

    return { isReplay: false, acquired: true };
  }

  /**
   * Guarda el resultado final del pago y extiende el TTL a 24 horas.
   */
  public async saveResult(
    tenantId: string,
    environment: string,
    key: string,
    bodyHash: string,
    response: PaymentResponseDto,
  ): Promise<void> {
    const redisKey = this.formatKey(tenantId, environment, key);

    if (!this.useMemoryFallback) {
      try {
        await this.redis.saveIdempotencyResult(
          redisKey,
          bodyHash,
          JSON.stringify(response),
          86400, // 24 horas
        );
        return;
      } catch (error) {
        this.logger.warn('Redis error in saveResult, using memory fallback');
        this.useMemoryFallback = true;
      }
    }

    // Fallback en memoria
    const ttlMs = 24 * 60 * 60 * 1000; // 24 horas
    this.memoryStore.set(redisKey, {
      status: 'COMPLETED',
      bodyHash,
      response,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Libera el lock en caso de fallos inesperados antes de persistir el pago.
   */
  public async releaseLock(tenantId: string, environment: string, key: string): Promise<void> {
    const redisKey = this.formatKey(tenantId, environment, key);

    if (!this.useMemoryFallback) {
      try {
        await this.redis.releaseIdempotencyLock(redisKey);
        return;
      } catch (error) {
        this.logger.warn('Redis error in releaseLock, using memory fallback');
        this.useMemoryFallback = true;
      }
    }

    // Fallback en memoria
    this.memoryStore.delete(redisKey);
  }

  private formatKey(tenantId: string, environment: string, key: string): string {
    return `idempotency:${tenantId}:${environment}:${key}`;
  }

  private getValidRecord(key: string, now: number): StoredIdempotencyRecord | null {
    const record = this.memoryStore.get(key);
    if (!record) return null;

    if (record.expiresAt <= now) {
      this.memoryStore.delete(key);
      return null;
    }

    return record;
  }
}