"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleHelp,
  Database,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}: {
  label: string;
  detail?: string;
  service?: PlatformHealthStatus;
}) {
  const isUp = service?.status === "up";
  const text = !service ? "Sin datos" : isUp ? "Operativo" : "Degradado";
  return (
    <Card>
      <CardContent className="flex min-h-28 items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-semibold">{text}</p>
          <p className="text-sm text-muted-foreground">
            {formatLatency(service?.latencyMs) ?? detail ?? (service?.provider ? `Proveedor: ${service.provider}` : "Sin información disponible")}
          </p>
        </div>
        <span className={`mt-1 size-2.5 shrink-0 rounded-full ${!service ? "bg-muted-foreground/40" : isUp ? "bg-success" : "bg-destructive"}`} aria-label={text} />
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
    void refreshStatus(true);
    const interval = window.setInterval(() => void refreshStatus(false), 30_000);
    return () => window.clearInterval(interval);
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h3 font-semibold">Estado de la plataforma</h1>
            {status && <Badge variant="outline" className={status.status === "ok" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}>{status.status === "ok" ? "Saludable" : "Degradado"}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Monitorea la salud de la infraestructura y la integridad de los datos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11" disabled={!backendIntegrationEnabled || refreshing || loading} onClick={() => void refreshStatus(false)}>
            {refreshing ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
            Actualizar
          </Button>
          <Button nativeButton={false} render={<a href={grafanaUrl} target="_blank" rel="noreferrer" />} className="min-h-11">
            Abrir Grafana <ExternalLink aria-hidden />
          </Button>
        </div>
      </div>

      {!backendIntegrationEnabled && (
        <Alert>
          <CircleHelp aria-hidden />
          <AlertDescription>Configura NEXT_PUBLIC_DEMO_MODE=false y NEXT_PUBLIC_API_URL para consultar los servicios reales.</AlertDescription>
        </Alert>
      )}
      {statusError && <Alert variant="destructive"><AlertDescription>{statusError}</AlertDescription></Alert>}
      {tenantsError && <Alert variant="destructive"><AlertDescription>No se pudieron cargar los tenants: {tenantsError}</AlertDescription></Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <HealthCard label="Base de datos" service={status?.services.database} detail={loading ? "Consultando…" : undefined} />
        <HealthCard label="RabbitMQ" service={status?.services.eventBus} detail={loading ? "Consultando…" : undefined} />
        <HealthCard label="Redis" service={status?.services.redis} detail={loading ? "Consultando…" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity aria-hidden className="size-4" />Circuitos por proveedor</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {status?.circuitBreakers.length ? status.circuitBreakers.map((circuit) => {
              const closed = circuit.state === "CLOSED";
              const label = circuit.state === "CLOSED" ? "Cerrado" : circuit.state === "OPEN" ? "Abierto" : "Prueba en curso";
              return (
                <div key={circuit.name} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                  <div>
                    <p className="font-medium">{circuit.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(circuit.failureRate * 100)}% de fallos · {circuit.requestsInWindow} solicitudes</p>
                  </div>
                  <Badge variant="outline" className={closed ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>{label}</Badge>
                </div>
              );
            }) : <p className="text-sm text-muted-foreground">{loading ? "Cargando circuitos…" : "No hay circuitos registrados."}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database aria-hidden className="size-4" />Outbox y DLQ</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-sm text-muted-foreground">Eventos pendientes del outbox</p>
              <p className="mt-1 text-2xl font-semibold">{status?.outbox.pending ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mensajes en la DLQ</p>
              <p className="mt-1 text-2xl font-semibold">{typeof dlqMessages === "number" ? dlqMessages : "No disponible"}</p>
              {typeof dlqMessages !== "number" && <p className="mt-1 text-xs text-muted-foreground">El endpoint actual no expone este contador.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-4" />Verificar integridad de auditoría</CardTitle>
          <p className="text-sm text-muted-foreground">Recalcula la cadena de hashes de un tenant y detecta la primera ruptura, si existe.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              aria-label="Tenant para verificar"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
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
