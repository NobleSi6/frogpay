import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import { PrismaTenantContextService } from '../database/prisma-tenant-context.service';

export const RATE_LIMIT_WINDOW_SECONDS = 60;
const PLAN_CACHE_MS = 60_000;

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** INCR atómico con expiración en la primera solicitud de la ventana; devuelve [contador, ms restantes]. */
const HIT_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return { count, redis.call('PTTL', KEYS[1]) }
`;

/**
 * Rate limiting por tenant y por API Key en Redis.
 * Ventana fija de 60 s. El límite depende del plan del tenant:
 * RATE_LIMIT_FREE_PER_MINUTE (60) y RATE_LIMIT_PREMIUM_PER_MINUTE (600), o
 * features.requestsPerMinute del plan si está definido.
 * Si Redis no responde se deja pasar la solicitud (fail-open) y se registra.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly planCache = new Map<string, { limit: number; at: number }>();
  private readonly freeLimit: number;
  private readonly premiumLimit: number;

  constructor(
    private readonly redis: RedisService,
    private readonly db: PrismaTenantContextService,
    config: ConfigService,
  ) {
    this.freeLimit = positive(config.get<string>('RATE_LIMIT_FREE_PER_MINUTE'), 60);
    this.premiumLimit = positive(config.get<string>('RATE_LIMIT_PREMIUM_PER_MINUTE'), 600);
  }

  /** Cuenta la solicitud contra el tenant y, si existe, contra la API Key. Gana la más restrictiva. */
  async hit(tenantId: string, apiKeyId?: string): Promise<RateLimitDecision> {
    const limit = await this.limitFor(tenantId);
    const window = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
    const keys = [`rl:tenant:${tenantId}:${window}`, ...(apiKeyId ? [`rl:key:${apiKeyId}:${window}`] : [])];

    try {
      let worst = { count: 0, ttlMs: RATE_LIMIT_WINDOW_SECONDS * 1000 };
      for (const key of keys) {
        const [count, ttlMs] =
          (await this.redis.eval(HIT_SCRIPT, 1, key, String(RATE_LIMIT_WINDOW_SECONDS * 1000))) as [number, number];
        if (count > worst.count) worst = { count, ttlMs };
      }
      return {
        allowed: worst.count <= limit,
        limit,
        remaining: Math.max(0, limit - worst.count),
        retryAfterSeconds: Math.max(1, Math.ceil(worst.ttlMs / 1000)),
      };
    } catch (error) {
      this.logger.warn(
        `Rate limiting omitido (Redis no disponible): ${error instanceof Error ? error.message : error}`,
      );
      return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
    }
  }

  private async limitFor(tenantId: string): Promise<number> {
    const cached = this.planCache.get(tenantId);
    if (cached && Date.now() - cached.at < PLAN_CACHE_MS) return cached.limit;

    let limit = this.freeLimit;
    try {
      const tenant = await this.db.withGlobalAccess((tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { plan: { select: { name: true, features: true } } },
        }),
      );
      const features = (tenant?.plan?.features ?? {}) as Record<string, unknown>;
      const custom = Number(features.requestsPerMinute);
      if (Number.isInteger(custom) && custom > 0) limit = custom;
      else if (tenant?.plan?.name?.toLowerCase().includes('premium')) limit = this.premiumLimit;
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el plan del tenant ${tenantId}; se usa el límite Free: ${String(error)}`,
      );
    }
    this.planCache.set(tenantId, { limit, at: Date.now() });
    return limit;
  }
}

function positive(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
