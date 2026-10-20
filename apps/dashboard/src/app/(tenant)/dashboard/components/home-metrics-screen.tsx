"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  KeyRound,
  Plus,
  ReceiptText,
  RotateCcw,
  Webhook,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/shared/error-alert";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuthSession } from "@/features/auth/auth-session";
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
import { formatMoney } from "../pagos/transacciones/payment-format";

const quickLinks = [
  {
    href: "/dashboard/pagos/transacciones",
    label: "Transacciones",
    description: "Filtra y revisa cada pago",
    icon: ReceiptText,
  },
  {
    href: "/dashboard/webhooks",
    label: "Webhooks",
    description: "Configura tus destinos",
    icon: Webhook,
  },
  {
    href: "/dashboard/api-keys",
    label: "API Keys",
    description: "Gestiona tus credenciales",
    icon: KeyRound,
  },
];

export function HomeMetricsScreen() {
  const session = useAuthSession();
  const { environment, setEnvironment } = useTenantEnvironment();
  const [days, setDays] = useState<DashboardDays>(7);

  const metrics = useDashboardMetrics({ days, environment });
  const plan = useTenantPlan();

  const businessName = session?.user.tenant?.name?.trim() || "tu negocio";
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("es-BO", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    [],
  );

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
      <div className="relative overflow-hidden rounded-3xl border border-primary-900/40 bg-gradient-to-br from-neutral-950 via-neutral-950 to-primary-950 p-6 text-white shadow-[0_24px_60px_-40px_rgba(4,120,87,0.65)] sm:p-8">
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-60" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-primary-500/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-secondary-500/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="flex items-center gap-2 text-xs font-medium text-neutral-400">
              <CalendarDays aria-hidden className="size-3.5" />
              {todayLabel}
            </p>
            <h1
              id="home-title"
              className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl"
            >
              Hola, {businessName}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-neutral-300">
              Este es el pulso de tu operación. {environment === "sandbox" ? "Estás trabajando en Sandbox: los pagos no son reales." : "Estás trabajando en Producción."}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/pagos/nuevo" />}
                className="min-h-10 bg-primary-400 text-neutral-950 shadow-lg shadow-primary-950/30 hover:bg-primary-300"
              >
                <Plus aria-hidden />
                Nuevo pago
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/pagos/transacciones" />}
                variant="outline"
                className="min-h-10 border-white/15 bg-white/[0.06] text-white shadow-none hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
              >
                Ver transacciones
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 sm:max-w-sm lg:w-auto lg:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">
                  Volumen
                </p>
                <Wallet aria-hidden className="size-4 text-primary-300" />
              </div>
              <p className="mt-2 truncate text-lg font-semibold tabular-nums text-white">
                {metricsData ? formatMoney(metricsData.volume, metricsData.currency) : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">
                  Pagos
                </p>
                <CreditCard aria-hidden className="size-4 text-secondary-300" />
              </div>
              <p className="mt-2 truncate text-lg font-semibold tabular-nums text-white">
                {metricsData ? metricsData.transactionCount.toLocaleString("es-BO") : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

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
        <Card>
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
        <Card>
          <CardContent>
            <EmptyState
              title="Aún no tienes pagos"
              description="Crea un pago de prueba para empezar a ver tus métricas, tendencias y resultados por método."
              icon={<CreditCard aria-hidden className="size-6" />}
              action={
                <Button
                  type="button"
                  nativeButton={false}
                  render={<Link href="/dashboard/pagos/nuevo" />}
                >
                  <Plus aria-hidden />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Button
              type="button"
              nativeButton={false}
              render={<Link href="/dashboard/pagos/nuevo" />}
              className="w-full justify-start"
            >
              <CreditCard aria-hidden className="size-4" />
              Nuevo pago de prueba
            </Button>
            {quickLinks.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border transition-colors group-hover:text-primary-700">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{description}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
