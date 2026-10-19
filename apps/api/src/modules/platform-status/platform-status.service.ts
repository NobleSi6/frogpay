import { Injectable } from '@nestjs/common';
import { RedisService } from '../../shared/cache/redis.service';
import { PrismaTenantContextService } from '../../shared/database/prisma-tenant-context.service';
import { ApiHealthIndicator } from '../health/indicators/api.health-indicator';
import { DatabaseHealthIndicator } from '../health/indicators/database.health-indicator';
import { EventBusHealthIndicator } from '../health/indicators/event-bus.health-indicator';
import { CircuitBreakerRegistry } from '../provider-adapters/resilience/circuit-breaker.registry';

@Injectable()
export class PlatformStatusService {
  constructor(
    private readonly database: PrismaTenantContextService,
    private readonly redis: RedisService,
    private readonly apiHealth: ApiHealthIndicator,
    private readonly dbHealth: DatabaseHealthIndicator,
    private readonly eventBusHealth: EventBusHealthIndicator,
    private readonly circuitBreakers: CircuitBreakerRegistry,
  ) {}

  async getStatus() {
    const [
      database,
      eventBus,
      redis,
      pendingOutbox,
    ] = await Promise.all([
      this.dbHealth.check(),
      this.eventBusHealth.check(),
      this.checkRedis(),
      this.countPendingOutbox(),
    ]);

    const api = this.apiHealth.check();
    const circuitBreakers = this.circuitBreakers.snapshot();

    const degraded =
      api.status !== 'up' ||
      database.status !== 'up' ||
      eventBus.status !== 'up' ||
      redis.status !== 'up' ||
      pendingOutbox === null;

    return {
      status: degraded ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      services: {
        api,
        database,
        eventBus,
        redis,
      },
      circuitBreakers,
      outbox: {
        pending: pendingOutbox,
      },
    };
  }

  private async checkRedis(): Promise<{
    status: 'up' | 'down';
  }> {
    try {
      const response = await this.redis.ping();
      return {
        status: response === 'PONG' ? 'up' : 'down',
      };
    } catch {
      return { status: 'down' };
    }
  }

  private async countPendingOutbox(): Promise<number | null> {
    try {
      return await this.database.withGlobalAccess((transaction) =>
        transaction.domain_event_outbox.count({
          where: {
            status: 'pending',
          },
        }),
      );
    } catch {
      return null;
    }
  }
}
