"use client";

import { RotateCcw } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/shared/error-alert";
import { formatUsagePercent } from "@/lib/api/dashboard-metrics";
import { planUsagePercent, type TenantPlanStatus } from "@/lib/api/tenant-plan";
import { RATE_LIMIT_MESSAGE, isRateLimitError } from "@/lib/api/query-error";
import { formatDecimalAmount } from "../pagos/transacciones/payment-format";

type PlanUsageCardProps = {
  query: UseQueryResult<TenantPlanStatus, unknown>;
  onRetry: () => void;
};

export function PlanUsageCard({ query, onRetry }: PlanUsageCardProps) {
  if (query.isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Plan y consumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-5 w-2/3 animate-pulse rounded-md bg-muted" />
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Plan y consumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorAlert
            error={query.error}
            title="No pudimos cargar tu plan"
            message={isRateLimitError(query.error) ? RATE_LIMIT_MESSAGE : undefined}
          />
          <Button type="button" variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden className="size-4" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = query.data;
  if (!status) return null;

  const percent = planUsagePercent(status);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Plan y consumo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">
          {percent === null
            ? `Plan ${status.plan.name}: sin límite mensual de volumen`
            : `Plan ${status.plan.name}: has usado ${formatUsagePercent(percent)} de tu límite mensual`}
        </p>
        {percent !== null && (
          <>
            <div
              role="progressbar"
              aria-label="Consumo del límite mensual del plan"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className={`h-full rounded-full ${status.limitReached ? "bg-destructive" : "bg-emerald-500"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Usado {formatDecimalAmount(status.volumeUsed)}
              {status.plan.monthlyVolumeLimit !== null && (
                <> de {formatDecimalAmount(status.plan.monthlyVolumeLimit)}</>
              )}
              {status.remaining !== null && (
                <> · Restante {formatDecimalAmount(status.remaining)}</>
              )}
              {status.limitReached && (
                <span className="ml-1 font-medium text-destructive">
                  · Límite mensual alcanzado
                </span>
              )}
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">Período: {status.period}</p>
      </CardContent>
    </Card>
  );
}
