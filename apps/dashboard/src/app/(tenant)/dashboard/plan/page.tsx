"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantPlan } from "@/lib/api/tenant-plan";
import { PlanUsageCard } from "../components/plan-usage-card";
import { formatDecimalAmount } from "../pagos/transacciones/payment-format";

export default function PlanPage() {
  const plan = useTenantPlan();
  const data = plan.data;

  return (
    <section className="space-y-6" aria-labelledby="plan-title">
      <header className="space-y-1">
        <h1 id="plan-title" className="text-2xl font-bold tracking-tight">
          Plan
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulta el plan contratado, el consumo mensual y las comisiones aplicadas.
        </p>
      </header>

      <PlanUsageCard
        query={plan}
        onRetry={() => {
          void plan.refetch();
        }}
      />

      {data && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Condiciones de tu plan</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Precio mensual</dt>
                <dd className="text-sm font-medium">
                  {Number(data.plan.monthlyPrice) === 0
                    ? "Gratis"
                    : `BOB ${formatDecimalAmount(data.plan.monthlyPrice)}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Comisión fija por pago</dt>
                <dd className="text-sm font-medium">
                  BOB {formatDecimalAmount(data.plan.commissionFixed)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Comisión porcentual</dt>
                <dd className="text-sm font-medium">
                  {(Number(data.plan.commissionPct) * 100).toLocaleString("es-BO", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  %
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
