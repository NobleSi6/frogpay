"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  Mail,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useTenants } from "@/features/tenants/components/tenant-provider";

function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  caption: string;
  icon: typeof Users;
  tone: "emerald" | "teal" | "amber";
  loading: boolean;
}) {
  const tones = {
    emerald:
      "from-primary-100 via-primary-50 to-white text-primary-700 ring-primary-200/70 dark:from-primary-900/40 dark:via-neutral-900 dark:to-neutral-900 dark:text-primary-200 dark:ring-primary-800/60",
    teal:
      "from-secondary-100 via-secondary-50 to-white text-secondary-700 ring-secondary-200/70 dark:from-secondary-900/40 dark:via-neutral-900 dark:to-neutral-900 dark:text-secondary-200 dark:ring-secondary-800/60",
    amber:
      "from-amber-100 via-amber-50 to-white text-amber-700 ring-amber-200/70 dark:from-amber-900/30 dark:via-neutral-900 dark:to-neutral-900 dark:text-amber-200 dark:ring-amber-800/50",
  };

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-primary-200/20 blur-2xl dark:bg-primary-700/10"
      />
      <CardContent className="relative flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {loading ? <span className="skeleton-shimmer inline-block h-8 w-12 rounded-lg" /> : value}
          </p>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${tones[tone]}`}
        >
          <Icon aria-hidden className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function Step({
  done,
  title,
  description,
  href,
  action,
}: {
  done?: boolean;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 aria-hidden className="size-5 text-primary-600 dark:text-primary-400" />
        ) : (
          <Circle aria-hidden className="size-5 text-muted-foreground/50" />
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center justify-between gap-2 text-sm font-medium">
          {title}
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
        <span className="sr-only">{action}</span>
      </span>
    </Link>
  );
}

export function AdminHomeScreen() {
  const { tenants, isLoading } = useTenants();
  const active = tenants.filter((tenant) => tenant.status === "Activo").length;
  const invited = tenants.filter((tenant) => tenant.status !== "Activo").length;
  const recent = tenants.slice(0, 5);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Panel de FrogPay"
        description="Administra las empresas que operan con FrogPay, sus invitaciones y la salud de la plataforma."
        icon={Building2}
        actions={
          <>
            <Button nativeButton={false} render={<Link href="/admin/tenants" />} variant="outline" className="min-h-10">
              Ver tenants
            </Button>
            <Button nativeButton={false} render={<Link href="/admin/tenants/nuevo" />} className="min-h-10">
              <Plus aria-hidden />
              Nuevo tenant
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Tenants"
          value={tenants.length}
          caption="Empresas registradas en la plataforma"
          icon={Users}
          tone="emerald"
          loading={isLoading}
        />
        <StatCard
          label="Activos"
          value={active}
          caption="Empresas operando actualmente"
          icon={Building2}
          tone="teal"
          loading={isLoading}
        />
        <StatCard
          label="Invitaciones"
          value={invited}
          caption="Empresas pendientes de activación"
          icon={Mail}
          tone="amber"
          loading={isLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Tenants recientes</CardTitle>
            <Button
              nativeButton={false}
              render={<Link href="/admin/tenants" />}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              Ver todos
              <ArrowRight aria-hidden />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 px-4 pb-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl border p-3">
                    <span className="skeleton-shimmer size-10 shrink-0 rounded-xl" />
                    <span className="flex-1 space-y-2">
                      <span className="skeleton-shimmer block h-3.5 w-1/3 rounded" />
                      <span className="skeleton-shimmer block h-3 w-1/2 rounded" />
                    </span>
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                title="Aún no hay empresas"
                description="Invita a la primera empresa para que empiece a operar con FrogPay."
                icon={<Building2 aria-hidden className="size-6" />}
                action={
                  <Button nativeButton={false} render={<Link href="/admin/tenants/nuevo" />}>
                    <Plus aria-hidden />
                    Invitar empresa
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-border/70 border-t">
                {recent.map((tenant) => {
                  const isActive = tenant.status === "Activo";
                  return (
                    <Link
                      key={tenant.id}
                      href="/admin/tenants"
                      className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-primary-50/40 focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-primary-900/10"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-100 to-secondary-100 text-sm font-semibold text-primary-800 ring-1 ring-primary-200/60 dark:from-primary-900/40 dark:to-secondary-900/40 dark:text-primary-200 dark:ring-primary-800/50">
                        {tenant.company.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tenant.company}</p>
                        <p className="truncate text-xs text-muted-foreground">{tenant.email}</p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <Badge
                          variant="outline"
                          className={
                            isActive
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-warning/30 bg-warning/10 text-warning"
                          }
                        >
                          {tenant.status}
                        </Badge>
                        <p className="mt-1 text-[11px] text-muted-foreground">{tenant.created}</p>
                      </div>
                      <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                      />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Siguientes pasos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              <Step
                done={tenants.length > 0}
                title="Invita tu primera empresa"
                description="Crea el tenant y envía la invitación al owner."
                href="/admin/tenants/nuevo"
                action="Invitar empresa"
              />
              <Step
                done={active > 0}
                title="Activa una empresa"
                description="La empresa completa su registro y empieza a operar."
                href="/admin/tenants"
                action="Ver tenants"
              />
              <Step
                title="Revisa la salud de la plataforma"
                description="Consulta servicios, circuitos, outbox y DLQ."
                href="/admin/platform-status"
                action="Abrir monitoreo"
              />
              <Step
                title="Verifica la integridad de auditoría"
                description="Recalcula la cadena de hashes de un tenant."
                href="/admin/platform-status"
                action="Verificar integridad"
              />
            </CardContent>
          </Card>

          <div className="relative overflow-hidden rounded-2xl border border-primary-900/40 bg-neutral-950 p-5 text-white shadow-lg shadow-primary-950/10">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary-500/25 blur-3xl"
            />
            <div className="relative space-y-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-400/15 text-primary-200 ring-1 ring-primary-400/20">
                <ShieldCheck aria-hidden className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Monitoreo en vivo</p>
                <p className="text-xs leading-relaxed text-neutral-400">
                  Servicios, circuit breakers y eventos pendientes en un solo lugar.
                </p>
              </div>
              <Link
                href="/admin/platform-status"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-300 transition-colors hover:text-primary-200 focus-visible:outline-2 focus-visible:outline-primary-300"
              >
                Abrir estado de la plataforma
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
