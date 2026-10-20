"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/shared/error-alert";
import { formatDecimalAmount } from "@/app/(tenant)/dashboard/pagos/transacciones/payment-format";
import { isPremiumPlanName, type PlanCatalogItem } from "../services/plan-service";

type PlanSelectorProps = {
  plans: PlanCatalogItem[];
  currentPlanId: string | undefined;
  isPremiumActive: boolean;
  isLoading: boolean;
  isChanging: boolean;
  onChoosePremium: (plan: PlanCatalogItem) => void;
  onSwitchToFree: (plan: PlanCatalogItem) => void;
};

function formatBob(value: string): string {
  return formatDecimalAmount(value);
}

function planLimitLabel(plan: PlanCatalogItem): string {
  return plan.monthlyVolumeLimit === null
    ? "Sin límite mensual de volumen"
    : `Hasta BOB ${formatBob(plan.monthlyVolumeLimit)} por mes`;
}

function planBenefits(plan: PlanCatalogItem): string[] {
  const features =
    plan.features && typeof plan.features === "object" && !Array.isArray(plan.features)
      ? (plan.features as Record<string, unknown>)
      : {};
  const labels: Record<string, string> = {
    webhooks: "Webhooks",
    dashboard_basic: "Dashboard básico",
  };
  const benefits = Object.entries(labels)
    .filter(([key]) => features[key] === true)
    .map(([, label]) => label);
  const maxUsers = features.max_users;
  if (typeof maxUsers === "number") {
    benefits.push(maxUsers === 1 ? "1 usuario" : `Hasta ${maxUsers} usuarios`);
  }
  return benefits;
}

export function PlanSelector({
  plans,
  currentPlanId,
  isPremiumActive,
  isLoading,
  isChanging,
  onChoosePremium,
  onSwitchToFree,
}: PlanSelectorProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((slot) => (
          <Card key={slot} className="shadow-sm">
            <CardHeader>
              <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map((plan) => {
        const isFree = Number(plan.monthlyPrice) === 0;
        const isPremium = isPremiumPlanName(plan.name);
        const isCurrent = plan.id === currentPlanId;
        const highlighted = isPremium;
        return (
          <Card
            key={plan.id}
            className={
              isCurrent
                ? "border-primary shadow-lg"
                : highlighted
                  ? "border-primary/40 shadow-sm"
                  : "shadow-sm"
            }
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="flex items-center gap-2">
                  {isCurrent && <Badge className="bg-primary text-primary-foreground">Actual</Badge>}
                  {highlighted && !isCurrent && (
                    <Badge variant="outline">Recomendado</Badge>
                  )}
                </div>
              </div>
              <CardDescription>{planLimitLabel(plan)}</CardDescription>
              <p className="mt-2 text-4xl font-black tracking-tight">
                {isFree ? "Gratis" : `BOB ${formatBob(plan.monthlyPrice)}`}
                {!isFree && (
                  <span className="ml-1 text-sm font-medium text-muted-foreground">/mes</span>
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Comisión por pago:{" "}
                <span className="font-medium text-foreground">
                  {(Number(plan.commissionPct) * 100).toLocaleString("es-BO", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  % + BOB {formatBob(plan.commissionFixed)}
                </span>
              </p>
              <ul className="space-y-2 text-sm">
                {planBenefits(plan).map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <Check aria-hidden className="size-4 text-primary" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              {isPremium ? (
                isCurrent ? (
                  <Button type="button" variant="outline" className="w-full" disabled>
                    Plan Premium activo
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isChanging}
                    onClick={() => onChoosePremium(plan)}
                  >
                    {isChanging && <LoaderCircle aria-hidden className="animate-spin" />}
                    Elegir Premium
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                )
              ) : isCurrent ? (
                <Button type="button" variant="outline" className="w-full" disabled>
                  Plan Free activo
                </Button>
              ) : isPremiumActive ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isChanging}
                  onClick={() => onSwitchToFree(plan)}
                >
                  {isChanging && <LoaderCircle aria-hidden className="animate-spin" />}
                  Volver a Free
                </Button>
              ) : (
                <Button type="button" variant="outline" className="w-full" disabled>
                  Comenzar gratis
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
      {plans.length === 0 && (
        <p className="text-sm text-muted-foreground md:col-span-2">
          No pudimos cargar el catálogo de planes.
        </p>
      )}
    </div>
  );
}

type PlanSelectorErrorProps = { error: unknown; onRetry: () => void };

export function PlanSelectorError({ error, onRetry }: PlanSelectorErrorProps) {
  return (
    <div className="space-y-3">
      <ErrorAlert error={error} title="No pudimos cargar los planes" />
      <Button type="button" variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
