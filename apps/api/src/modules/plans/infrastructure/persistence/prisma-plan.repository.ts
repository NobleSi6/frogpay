import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantContextService } from '../../../../shared/database/index.js';
import { Plan } from '../../domain/entities/plan.entity.js';
import {
  ChangeTenantPlanResult,
  PlanRepository,
  TenantPlanData,
} from '../../domain/repositories/plan.repository.js';

const planSelect = {
  id: true,
  name: true,
  monthly_price: true,
  monthly_volume_limit: true,
  commission_fixed: true,
  commission_pct: true,
  features: true,
} satisfies Prisma.planSelect;

function mapPlan(row: {
  id: string;
  name: string;
  monthly_price: Prisma.Decimal;
  monthly_volume_limit: Prisma.Decimal | null;
  commission_fixed: Prisma.Decimal;
  commission_pct: Prisma.Decimal;
  features: Prisma.JsonValue;
}): Plan {
  return {
    id: row.id,
    name: row.name,
    monthlyPrice: row.monthly_price.toFixed(2),
    monthlyVolumeLimit: row.monthly_volume_limit?.toFixed(2) ?? null,
    commissionFixed: row.commission_fixed.toFixed(2),
    commissionPct: row.commission_pct.toFixed(4),
    features: row.features,
  };
}

@Injectable()
export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  findCatalog(): Promise<Plan[]> {
    return this.tenantContext.withGlobalAccess(async (tx) => {
      const rows = await tx.plan.findMany({ select: planSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
      return rows.map(mapPlan);
    });
  }

  findTenantPlan(tenantId: string, period: string): Promise<TenantPlanData | null> {
    return this.tenantContext.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, plan: { select: planSelect } },
      });
      if (!tenant) return null;

      const usage = await tx.tenant_plan_usage.findUnique({
        where: { tenant_id_period: { tenant_id: tenantId, period } },
        select: { volume_used: true, tx_count: true },
      });

      return {
        plan: tenant.plan ? mapPlan(tenant.plan) : null,
        volumeUsed: usage?.volume_used.toFixed(2) ?? '0.00',
        txCount: usage?.tx_count ?? 0,
      };
    });
  }

  changeTenantPlan(
    tenantId: string,
    planId: string,
    period: string,
  ): Promise<ChangeTenantPlanResult> {
    return this.tenantContext.withTenant(tenantId, async (tx) => {
      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: planSelect,
      });
      if (!plan) return { kind: 'plan-not-found' };

      const tenant = await tx.tenant.updateMany({
        where: { id: tenantId },
        data: { plan_id: planId },
      });
      if (tenant.count === 0) return { kind: 'tenant-not-found' };

      const usage = await tx.tenant_plan_usage.findUnique({
        where: { tenant_id_period: { tenant_id: tenantId, period } },
        select: { volume_used: true, tx_count: true },
      });

      return {
        kind: 'tenant-plan',
        data: {
          plan: mapPlan(plan),
          volumeUsed: usage?.volume_used.toFixed(2) ?? '0.00',
          txCount: usage?.tx_count ?? 0,
        },
      };
    });
  }
}