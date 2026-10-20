"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, ReceiptText, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/shared/error-alert";
import { EmptyState } from "@/components/shared/empty-state";
import { useTenantEnvironment } from "@/features/provider-credentials/environment-context";
import {
  useDashboardMetrics,
  type DashboardDays,
  type DashboardEnvironment,
} from "@/lib/api/dashboard-metrics";
import { useTenantPlan } from "@/lib/api/tenant-plan";
import { RATE_LIMIT_MESSAGE, isRateLimitError } from "@/lib/api/query-error";
import { MetricsControls } from "./metrics-controls";
import { MetricsKpiCards } from "./metrics-kpi-cards";
import { MetricsCharts } from "./metrics-charts";
import { PlanUsageCard } from "./plan-usage-card";
import { HomeMetricsSkeleton } from "./home-metrics-skeleton";

export function HomeMetricsScreen() {
  const { environment, setEnvironment } = useTenantEnvironment();
  const [days, setDays] = useState<DashboardDays>(7);

  const metrics = useDashboardMetrics({ days, environment });
  const plan = useTenantPlan();

  const metricsData = metrics.data;
  const isEmpty = metricsData !== undefined && metricsData.transactionCount === 0;

  const handleRefresh = useCallback(() => {
    void metrics.refetch();
  }, [metrics]);

  const handleEnvironmentChange = useCallback(
    (next: DashboardEnvironment) => {
      setEnvironment(next);
    },
    [setEnvironment],
  );

  const rangeNote = useMemo(() => {
    if (!metricsData) return null;
    return `Rango: ${metricsData.from} al ${metricsData.to} · Fechas en UTC (en Bolivia el día UTC cambia a las 20:00). El último día, hoy, está incompleto.`;
  }, [metricsData]);

  return (
    <section aria-labelledby="home-title" className="space-y-6">
      <header className="space-y-1">
        <h1 id="home-title" className="text-2xl font-bold tracking-tight">
          Inicio
        </h1>
        <p className="text-sm text-muted-foreground">
          Métricas de tu cuenta para el ambiente y el rango seleccionados.
        </p>
      </header>

      <MetricsControls
        days={days}
        environment={environment}
        onDaysChange={setDays}
        onEnvironmentChange={handleEnvironmentChange}
        onRefresh={handleRefresh}
        generatedAt={metricsData?.generatedAt ?? null}
        isRefreshing={metrics.isFetching && !metrics.isLoading}
      />

      {rangeNote && <p className="text-xs text-muted-foreground">{rangeNote}</p>}

      {metrics.isError ? (
        <Card className="shadow-sm">
          <CardContent className="space-y-3 py-8">
            <ErrorAlert
              error={metrics.error}
              title="No pudimos cargar las métricas"
              message={isRateLimitError(metrics.error) ? RATE_LIMIT_MESSAGE : undefined}
            />
            <Button type="button" variant="outline" onClick={handleRefresh}>
              <RotateCcw aria-hidden className="size-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : metrics.isLoading ? (
        <HomeMetricsSkeleton />
      ) : isEmpty ? (
        <Card className="shadow-sm">
          <CardContent>
            <EmptyState
              title="Aún no tienes pagos"
              description="Crea un pago de prueba para empezar a ver tus métricas."
              icon={<CreditCard aria-hidden className="size-5" />}
              action={
                <Button
                  type="button"
                  nativeButton={false}
                  render={<Link href="/dashboard/pagos/nuevo" />}
                >
                  Crear pago de prueba
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : metricsData ? (
        <>
          <MetricsKpiCards metrics={metricsData} />
          <MetricsCharts metrics={metricsData} />
        </>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PlanUsageCard
            query={plan}
            onRetry={() => {
              void plan.refetch();
            }}
          />
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              type="button"
              nativeButton={false}
              render={<Link href="/dashboard/pagos/nuevo" />}
              className="justify-start"
            >
              <CreditCard aria-hidden className="size-4" />
              Nuevo pago de prueba
            </Button>
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard/pagos/transacciones" />}
              className="justify-start"
            >
              <ReceiptText aria-hidden className="size-4" />
              Ver todas las transacciones
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
