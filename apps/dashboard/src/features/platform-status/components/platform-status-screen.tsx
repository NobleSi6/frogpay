"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleHelp,
  Database,
  ExternalLink,
  Layers,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Timer,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { useTenants } from "@/features/tenants/components/tenant-provider";
import { backendIntegrationEnabled } from "@/lib/api-client";
import {
  getPlatformStatus,
  verifyAuditIntegrity,
  type AuditIntegrityResult,
  type PlatformHealthStatus,
  type PlatformStatus,
} from "../services/platform-status-service";

const grafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_URL?.trim() || "http://localhost:3002";

function formatLatency(latencyMs?: number) {
  return typeof latencyMs === "number" && latencyMs >= 0 ? `${latencyMs} ms` : null;
}

function HealthCard({
  label,
  detail,
  service,
  icon: Icon,
  loading,
}: {
  label: string;
  detail?: string;
  service?: PlatformHealthStatus;
  icon: LucideIcon;
  loading?: boolean;
}) {
  const isUp = service?.status === "up";
  const text = !service ? (loading ? "Consultando…" : "Sin datos") : isUp ? "Operativo" : "Degradado";
  const latency = formatLatency(service?.latencyMs);
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-primary-200/20 blur-2xl dark:bg-primary-700/10"
      />
      <CardContent className="relative flex min-h-32 items-start justify-between gap-3 p-5">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border">
              <Icon aria-hidden className="size-[18px]" />
            </span>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tracking-tight">{text}</p>
            {!loading && (
              <span
                aria-hidden
                className={`size-2 rounded-full ${
                  !service ? "bg-muted-foreground/40" : isUp ? "bg-success animate-soft-pulse" : "bg-destructive animate-soft-pulse"
                }`}
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {latency ??
              detail ??
              (service?.provider ? `Proveedor: ${service.provider}` : "Sin información disponible")}
          </p>
        </div>
        {latency && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-card px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground shadow-sm">
            <Timer aria-hidden className="size-3" />
            {latency}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

export function PlatformStatusScreen() {
  const { tenants, error: tenantsError } = useTenants();
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [loading, setLoading] = useState(backendIntegrationEnabled);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [auditResult, setAuditResult] = useState<AuditIntegrityResult | null>(null);
  const [auditError, setAuditError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const refreshStatus = useCallback(async (showLoading: boolean) => {
    if (!backendIntegrationEnabled) return;
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    setStatusError("");
    try {
      setStatus(await getPlatformStatus());
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "No se pudo cargar el estado de la plataforma.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshStatus(true), 0);
    const interval = window.setInterval(() => void refreshStatus(false), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refreshStatus]);

  async function handleVerifyIntegrity() {
    if (!selectedTenantId) return;
    setVerifying(true);
    setAuditError("");
    setAuditResult(null);
    try {
      setAuditResult(await verifyAuditIntegrity(selectedTenantId));
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : "No se pudo verificar la integridad de auditoría.");
    } finally {
      setVerifying(false);
    }
  }

  const dlqMessages = status?.dlq?.messages ?? status?.dlq?.pending;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Estado de la plataforma"
        description="Monitorea la salud de la infraestructura, los circuitos de proveedores y la integridad de los datos."
        icon={Activity}
        actions={
          <>
            {status && (
              <Badge
                variant="outline"
                className={
                  status.status === "ok"
                    ? "h-8 gap-1.5 border-success/30 bg-success/10 px-3 text-success"
                    : "h-8 gap-1.5 border-warning/30 bg-warning/10 px-3 text-warning"
                }
              >
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${status.status === "ok" ? "bg-success animate-soft-pulse" : "bg-warning animate-soft-pulse"}`}
                />
                {status.status === "ok" ? "Saludable" : "Degradado"}
              </Badge>
            )}
            <Button
              variant="outline"
              className="min-h-10"
              disabled={!backendIntegrationEnabled || refreshing || loading}
              onClick={() => void refreshStatus(false)}
            >
              {refreshing ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
              Actualizar
            </Button>
            <Button
              nativeButton={false}
              render={<a href={grafanaUrl} target="_blank" rel="noreferrer" />}
              className="min-h-10"
            >
              Abrir Grafana <ExternalLink aria-hidden />
            </Button>
          </>
        }
      />

      {!backendIntegrationEnabled && (
        <Alert>
          <CircleHelp aria-hidden />
          <AlertDescription>Configura NEXT_PUBLIC_DEMO_MODE=false y NEXT_PUBLIC_API_URL para consultar los servicios reales.</AlertDescription>
        </Alert>
      )}
      {statusError && <Alert variant="destructive"><AlertDescription>{statusError}</AlertDescription></Alert>}
      {tenantsError && <Alert variant="destructive"><AlertDescription>No se pudieron cargar los tenants: {tenantsError}</AlertDescription></Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <HealthCard
          label="Base de datos"
          service={status?.services.database}
          icon={Database}
          loading={loading}
        />
        <HealthCard
          label="RabbitMQ"
          service={status?.services.eventBus}
          icon={Layers}
          loading={loading}
        />
        <HealthCard
          label="Redis"
          service={status?.services.redis}
          icon={Zap}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity aria-hidden className="size-4 text-primary-600" />
              Circuitos por proveedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status?.circuitBreakers.length ? status.circuitBreakers.map((circuit) => {
              const closed = circuit.state === "CLOSED";
              const label = circuit.state === "CLOSED" ? "Cerrado" : circuit.state === "OPEN" ? "Abierto" : "Prueba en curso";
              const percent = Math.round(circuit.failureRate * 100);
              return (
                <div key={circuit.name} className="space-y-2 border-b border-border/70 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{circuit.name}</p>
                      <p className="text-xs text-muted-foreground">{percent}% de fallos · {circuit.requestsInWindow} solicitudes</p>
                    </div>
                    <Badge variant="outline" className={closed ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>{label}</Badge>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Tasa de fallos de ${circuit.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${closed ? "bg-primary-500" : "bg-destructive"}`}
                      style={{ width: `${Math.max(percent, 2)}%` }}
                    />
                  </div>
                </div>
              );
            }) : <p className="text-sm text-muted-foreground">{loading ? "Cargando circuitos…" : "No hay circuitos registrados."}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database aria-hidden className="size-4 text-primary-600" />
              Outbox y DLQ
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Eventos pendientes del outbox</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{status?.outbox.pending ?? "—"}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Mensajes en la DLQ</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{typeof dlqMessages === "number" ? dlqMessages : "No disponible"}</p>
              {typeof dlqMessages !== "number" && <p className="mt-1 text-xs text-muted-foreground">El endpoint actual no expone este contador.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck aria-hidden className="size-4 text-primary-600" />Verificar integridad de auditoría</CardTitle>
          <p className="text-sm text-muted-foreground">Recalcula la cadena de hashes de un tenant y detecta la primera ruptura, si existe.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              aria-label="Tenant para verificar"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              value={selectedTenantId}
              onChange={(event) => { setSelectedTenantId(event.target.value); setAuditResult(null); setAuditError(""); }}
              disabled={!backendIntegrationEnabled || tenants.length === 0 || verifying}
            >
              <option value="">Selecciona un tenant</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.company}</option>)}
            </select>
            <Button className="min-h-11 sm:min-w-48" disabled={!backendIntegrationEnabled || !selectedTenantId || verifying} onClick={() => void handleVerifyIntegrity()}>
              {verifying ? <LoaderCircle aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
              {verifying ? "Verificando…" : "Verificar integridad"}
            </Button>
          </div>
          {backendIntegrationEnabled && tenants.length === 0 && !tenantsError && <p className="text-sm text-muted-foreground">No hay tenants disponibles para verificar.</p>}
          {auditError && <Alert variant="destructive"><AlertDescription>{auditError}</AlertDescription></Alert>}
          {auditResult && (
            <Alert variant={auditResult.valid ? "default" : "destructive"}>
              {auditResult.valid ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
              <AlertDescription>
                {auditResult.valid
                  ? `Cadena íntegra. ${auditResult.recordsChecked} registros verificados.`
                  : `Se detectó una ruptura en el evento ${auditResult.firstBrokenEventId ?? "desconocido"}${auditResult.firstBrokenAt ? ` (${new Date(auditResult.firstBrokenAt).toLocaleString("es")})` : ""}.`}
              </AlertDescription>
            </Alert>
          )}
          {status && <p className="text-xs text-muted-foreground">Última actualización: {new Date(status.timestamp).toLocaleString("es")}</p>}
        </CardContent>
      </Card>
    </section>
  );
}
