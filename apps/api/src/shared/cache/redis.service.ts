import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    super({
      host: configService.getOrThrow<string>('REDIS_HOST'),
      port: configService.getOrThrow<number>('REDIS_PORT'),
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      db: configService.get<number>('REDIS_DB') || 0,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis connection failed after 3 retries, continuing without cache');
          return null; // Detener reintentos
        }
        return Math.min(times * 1000, 3000);
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ping();
      this.logger.log('Redis connection established');
    } catch {
      this.logger.warn('Redis unavailable, idempotency will use memory fallback');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }

  /**
   * Script Lua para adquirir lock de idempotencia de forma atómica.
   * Retorna:
   * - 0: lock adquirido (nuevo)
   * - 1: lock ya existe en PROCESSING
   * - 2: lock COMPLETED con hash diferente (reuso indebido)
   * - 3: lock COMPLETED con mismo hash (replay)
   */
  private readonly acquireLockScript = `
    local key = KEYS[1]
    local bodyHash = ARGV[1]
    local ttl = tonumber(ARGV[2])

    local existing = redis.call('HGETALL', key)
    if #existing > 0 then
      local status = existing[2]
      local storedHash = existing[4]

      if status == 'PROCESSING' then
        return 1
      end

      if status == 'COMPLETED' then
        if storedHash ~= bodyHash then
          return 2
        end
        local response = existing[6]
        return {3, response}
      end
    end

    redis.call('HSET', key, 'status', 'PROCESSING', 'bodyHash', bodyHash, 'createdAt', tostring(now()))
    redis.call('EXPIRE', key, ttl)
    return 0
  `;

  /**
   * Intenta adquirir un lock de idempotencia de forma atómica.
   * Usa un script Lua para garantizar atomicidad.
   */
  async acquireIdempotencyLock(
    key: string,
    bodyHash: string,
    processingTtlSeconds: number = 60,
  ): Promise<{ acquired: boolean; isReplay: boolean; storedHash?: string; response?: string }> {
    try {
      const result = await this.eval(this.acquireLockScript, 1, key, bodyHash, processingTtlSeconds.toString());

      if (result === 0) {
        return { acquired: true, isReplay: false };
      }

      if (result === 1) {
        return { acquired: false, isReplay: false };
      }

      if (result === 2) {
        throw new Error('idempotency_key_reused');
      }

      if (Array.isArray(result) && result[0] === 3) {
        return { acquired: false, isReplay: true, response: result[1] };
      }

      return { acquired: false, isReplay: false };
    } catch (error) {
      if (error instanceof Error && error.message === 'idempotency_key_reused') {
        throw error;
      }
      // Error de Redis, cambiar a fallback
      this.logger.warn('Redis error in acquireLock, switching to memory fallback');
      throw error;
    }
  }

  /**
   * Guarda el resultado y extiende el TTL a 24 horas.
   */
  async saveIdempotencyResult(
    key: string,
    bodyHash: string,
    response: string,
    completedTtlSeconds: number = 86400, // 24 horas
  ): Promise<void> {
    try {
      await this.hset(key, {
        status: 'COMPLETED',
        bodyHash,
        response,
        completedAt: Date.now().toString(),
      });
      await this.expire(key, completedTtlSeconds);
    } catch (error) {
      this.logger.warn('Redis error in saveIdempotencyResult');
      throw error;
    }
  }

  /**
   * Libera el lock en caso de error.
   */
  async releaseIdempotencyLock(key: string): Promise<void> {
    try {
      await this.del(key);
    } catch {
      this.logger.warn('Redis error in releaseIdempotencyLock');
    }
  }

  /**
   * Obtiene la respuesta guardada si existe.
   */
  async getIdempotencyResponse(key: string): Promise<string | null> {
    try {
      const data = await this.hgetall(key);
      return data.response || null;
    } catch {
      this.logger.warn('Redis error in getIdempotencyResponse');
      return null;
    }
  }
}