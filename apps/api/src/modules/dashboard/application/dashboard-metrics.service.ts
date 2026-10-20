import { Injectable, Logger } from '@nestjs/common';
import { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import { RedisService } from '../../../shared/cache/redis.service';

type MetricsEnvironment = 'sandbox' | 'production';
type MetricsDays = 7 | 30;

const SUCCESS_STATES = new Set(['approved', 'refunded', 'partially_refunded']);
const TERMINAL_STATES = new Set([
  'approved',
  'rejected',
  'failed',
  'expired',
  'refunded',
  'partially_refunded',
]);

export interface DashboardMetricsResponse {
  from: string;
  to: string;
  environment: MetricsEnvironment;
  currency: string;
  volume: string;
  transactionCount: number;
  approvalRate: number;
  commissionAmount: string;
  netAmount: string;
  byMethod: Array<Omit<MutableMethod, 'volume'> & { volume: string }>;
  dailySeries: Array<
    Omit<MutableDaily, 'volume'> & { volume: string; approvalRate: number }
  >;
  generatedAt: string;
}

@Injectable()
export class DashboardMetricsService {
  private readonly logger = new Logger(DashboardMetricsService.name);
  private readonly ttlSeconds = 300;

  constructor(
    private readonly db: PrismaTenantContextService,
    private readonly redis: RedisService,
  ) {}

  async get(
    tenantId: string,
    days: MetricsDays,
    environment: MetricsEnvironment,
  ): Promise<DashboardMetricsResponse> {
    const range = utcRange(days);
    const cacheKey = `dashboard:metrics:v1:${tenantId}:${environment}:${days}:${range.fromKey}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as DashboardMetricsResponse;
    } catch {
      this.logger.warn(
        'Redis no disponible para métricas; se consultará PostgreSQL',
      );
    }

    const payments = await this.db.withTenant(tenantId, (tx) =>
      tx.payment.findMany({
        where: {
          environment,
          created_at: { gte: range.from, lt: range.toExclusive },
        },
        select: {
          amount: true,
          status: true,
          commission_amount: true,
          net_amount: true,
          created_at: true,
          provider: { select: { payment_method: { select: { code: true } } } },
        },
      }),
    );

    const daily = new Map<string, MutableDaily>();
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(range.from);
      date.setUTCDate(date.getUTCDate() + offset);
      daily.set(dateKey(date), emptyDaily(dateKey(date)));
    }
    const byMethod = new Map<string, MutableMethod>();
    let volume = 0;
    let commissionAmount = 0;
    let netAmount = 0;
    let successful = 0;
    let terminal = 0;

    for (const payment of payments) {
      const amount = Number(payment.amount);
      const isSuccess = SUCCESS_STATES.has(payment.status);
      const isTerminal = TERMINAL_STATES.has(payment.status);
      if (isSuccess) {
        successful += 1;
        volume += amount;
        commissionAmount += Number(payment.commission_amount ?? 0);
        netAmount += Number(payment.net_amount ?? 0);
      }
      if (isTerminal) terminal += 1;

      const methodCode = payment.provider.payment_method.code;
      const method = byMethod.get(methodCode) ?? {
        paymentMethod: methodCode,
        transactionCount: 0,
        approvedCount: 0,
        volume: 0,
      };
      method.transactionCount += 1;
      if (isSuccess) {
        method.approvedCount += 1;
        method.volume += amount;
      }
      byMethod.set(methodCode, method);

      const day = daily.get(dateKey(payment.created_at));
      if (!day) continue;
      day.transactionCount += 1;
      if (isSuccess) {
        day.approvedCount += 1;
        day.volume += amount;
      } else if (payment.status === 'rejected') day.rejectedCount += 1;
      else if (payment.status === 'failed' || payment.status === 'expired')
        day.failedCount += 1;
      else if (payment.status === 'pending') day.pendingCount += 1;
    }

    const result = {
      from: range.fromKey,
      to: dateKey(new Date(range.toExclusive.getTime() - 1)),
      environment,
      currency: 'BOB',
      volume: money(volume),
      transactionCount: payments.length,
      approvalRate: terminal === 0 ? 0 : successful / terminal,
      commissionAmount: money(commissionAmount),
      netAmount: money(netAmount),
      byMethod: [...byMethod.values()]
        .sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod))
        .map((item) => ({ ...item, volume: money(item.volume) })),
      dailySeries: [...daily.values()].map((item) => {
        const dailyTerminal =
          item.approvedCount + item.rejectedCount + item.failedCount;
        return {
          ...item,
          volume: money(item.volume),
          approvalRate:
            dailyTerminal === 0 ? 0 : item.approvedCount / dailyTerminal,
        };
      }),
      generatedAt: new Date().toISOString(),
    };

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        this.ttlSeconds,
      );
    } catch {
      this.logger.warn('No se pudo guardar la caché de métricas');
    }
    return result;
  }
}

interface MutableDaily {
  date: string;
  transactionCount: number;
  volume: number;
  approvedCount: number;
  rejectedCount: number;
  failedCount: number;
  pendingCount: number;
}

interface MutableMethod {
  paymentMethod: string;
  transactionCount: number;
  approvedCount: number;
  volume: number;
}

function emptyDaily(date: string): MutableDaily {
  return {
    date,
    transactionCount: 0,
    volume: 0,
    approvedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    pendingCount: 0,
  };
}

function utcRange(days: MetricsDays) {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const toExclusive = new Date(today);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive, fromKey: dateKey(from) };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function money(value: number): string {
  return value.toFixed(2);
}
