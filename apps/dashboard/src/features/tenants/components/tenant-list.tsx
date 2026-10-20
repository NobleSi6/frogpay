"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Mail, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useTenants } from "./tenant-provider";
import { backendIntegrationEnabled } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";

const columns = ["Empresa", "Email owner", "Estado", "Fecha de creación", "Acciones"];
const filters = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "invited", label: "Invitados" },
] as const;

type FilterValue = (typeof filters)[number]["value"];

function SummaryCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-100 to-secondary-100 text-primary-700 ring-1 ring-primary-200/60 dark:from-primary-900/40 dark:to-secondary-900/40 dark:text-primary-200 dark:ring-primary-800/50">
          <Icon aria-hidden className="size-[18px]" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">
            {loading ? <span className="skeleton-shimmer inline-block h-6 w-8 rounded" /> : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function TenantList() {
  const { tenants, isLoading, error } = useTenants();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const active = tenants.filter((tenant) => tenant.status === "Activo").length;
  const invited = tenants.length - active;
  const normalizedQuery = query.trim().toLowerCase();

  const visibleTenants = useMemo(
    () =>
      tenants.filter((tenant) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "active" && tenant.status === "Activo") ||
          (filter === "invited" && tenant.status !== "Activo");
        const matchesQuery =
          !normalizedQuery ||
          tenant.company.toLowerCase().includes(normalizedQuery) ||
          tenant.email.toLowerCase().includes(normalizedQuery);
        return matchesFilter && matchesQuery;
      }),
    [filter, normalizedQuery, tenants],
  );

  const isEmpty = !isLoading && tenants.length === 0;
  const noResults = !isLoading && tenants.length > 0 && visibleTenants.length === 0;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Tenants"
        description="Gestiona las empresas invitadas a FrogPay y su estado de activación."
        icon={Building2}
        actions={
          <Button nativeButton={false} render={<Link href="/admin/tenants/nuevo" />} className="min-h-10">
            <Plus aria-hidden />
            Nuevo tenant
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total" value={tenants.length} icon={Users} loading={isLoading} />
        <SummaryCard label="Activos" value={active} icon={CheckCircle2} loading={isLoading} />
        <SummaryCard label="Invitados" value={invited} icon={Mail} loading={isLoading} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por empresa o email…"
                aria-label="Buscar tenant"
                className="h-10 pl-9"
              />
            </div>
            <div
              role="group"
              aria-label="Filtrar tenants por estado"
              className="flex rounded-xl border bg-muted/40 p-1"
            >
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                    filter === item.value
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <Table className="min-w-180">
            <TableHeader>
              <TableRow>
                {columns.map((title) => (
                  <TableHead key={title} scope="col">
                    {title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={`tenant-skeleton-${index}`} aria-hidden>
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <span className="skeleton-shimmer block h-4 w-full max-w-32 rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isEmpty ? (
                <TableRow>
                  <TableCell colSpan={columns.length}>
                    <EmptyState
                      title="Aún no hay tenants"
                      description="Invita a la primera empresa para que empiece a operar con FrogPay."
                      icon={<Building2 aria-hidden className="size-6" />}
                      action={
                        <Button nativeButton={false} render={<Link href="/admin/tenants/nuevo" />}>
                          <Plus aria-hidden />
                          Nuevo tenant
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : noResults ? (
                <TableRow>
                  <TableCell colSpan={columns.length}>
                    <EmptyState
                      title="Sin resultados"
                      description="Ninguna empresa coincide con la búsqueda o el filtro seleccionado."
                      icon={<Search aria-hidden className="size-6" />}
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                          }}
                        >
                          Limpiar filtros
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                visibleTenants.map((tenant) => {
                  const isActive = tenant.status === "Activo";
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="max-w-64 whitespace-normal break-words">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-100 to-secondary-100 text-xs font-semibold text-primary-800 ring-1 ring-primary-200/60 dark:from-primary-900/40 dark:to-secondary-900/40 dark:text-primary-200 dark:ring-primary-800/50">
                            {tenant.company.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-medium">{tenant.company}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal break-all text-muted-foreground">
                        {tenant.email}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-muted-foreground">{tenant.created}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" disabled title="Disponible en un próximo sprint">
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {!backendIntegrationEnabled && (
        <p className="text-xs text-muted-foreground">
          Vista de demostración. Los cambios se conservan durante la navegación y se reinician al recargar.
        </p>
      )}
    </section>
  );
}
