"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantPlan } from "@/lib/api/tenant-plan";
import { PlanUsageCard } from "../components/plan-usage-card";
import { formatDecimalAmount } from "../pagos/transacciones/payment-format";
import { ErrorAlert } from "@/components/shared/error-alert";
import {
  PlanSelector,
  PlanSelectorError,
} from "@/features/plans/components/plan-selector";
import { PremiumPaymentModal } from "@/features/plans/components/premium-payment-modal";
import {
  formatPlanExpiry,
  isPremiumPlanName,
  useChangeTenantPlan,
  usePlanCatalog,
  type PlanCatalogItem,
} from "@/features/plans/services/plan-service";

export default function PlanPage() {
  const plan = useTenantPlan();
  const catalog = usePlanCatalog();
  const changePlan = useChangeTenantPlan();
  const [premiumModalPlan, setPremiumModalPlan] = useState<PlanCatalogItem | null>(null);

  const data = plan.data;
  const isPremiumActive = data ? isPremiumPlanName(data.plan.name) : false;
  const expiryLabel = formatPlanExpiry(data?.planExpiresAt);

  function handleChoosePremium(selected: PlanCatalogItem) {
    setPremiumModalPlan(selected);
    changePlan.reset();
  }

  function confirmPremium() {
    if (!premiumModalPlan) return;
    changePlan.mutate(premiumModalPlan.id, {
      onSuccess: () => {
        setPremiumModalPlan(null);
      },
    });
  }

  function handleSwitchToFree(freePlan: PlanCatalogItem) {
    changePlan.mutate(freePlan.id);
  }

  return (
    <section className="space-y-6" aria-labelledby="plan-title">
      <header className="space-y-1">
        <h1 id="plan-title" className="text-2xl font-bold tracking-tight">
          Plan
        </h1>
        <p className="text-sm text-muted-foreground">
          Elige tu plan, consulta el consumo mensual y las comisiones aplicadas.
        </p>
      </header>

      {isPremiumActive && data && (
        <Card className="border-primary shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Plan Premium activo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Tu plan Premium no tiene límite mensual de volumen.
            </p>
            {expiryLabel ? (
              <p className="text-sm">
                Vence el{" "}
                <span className="font-medium">{expiryLabel}</span>. Al vencer, tu cuenta volverá al
                plan Free con su límite de uso.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin fecha de vencimiento registrada.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Elige tu plan</h2>
        <p className="text-sm text-muted-foreground">
          Free incluye un límite mensual de volumen. Premium elimina el límite durante 1 mes por
          BOB 150 (pago simulado, sin cobro real).
        </p>
        {changePlan.isError && !premiumModalPlan && (
          <ErrorAlert error={changePlan.error} title="No se pudo cambiar el plan" />
        )}
        {catalog.isError ? (
          <PlanSelectorError
            error={catalog.error}
            onRetry={() => {
              void catalog.refetch();
            }}
          />
        ) : (
          <PlanSelector
            plans={catalog.data ?? []}
            currentPlanId={data?.plan.id}
            isPremiumActive={isPremiumActive}
            isLoading={catalog.isLoading}
            isChanging={changePlan.isPending}
            onChoosePremium={handleChoosePremium}
            onSwitchToFree={handleSwitchToFree}
          />
        )}
      </div>

      {premiumModalPlan && (
        <PremiumPaymentModal
          priceLabel={`BOB ${formatDecimalAmount(premiumModalPlan.monthlyPrice)}`}
          isPending={changePlan.isPending}
          error={changePlan.error}
          onCancel={() => {
            if (!changePlan.isPending) {
              changePlan.reset();
              setPremiumModalPlan(null);
            }
          }}
          onConfirm={confirmPremium}
        />
      )}
    </section>
  );
}
