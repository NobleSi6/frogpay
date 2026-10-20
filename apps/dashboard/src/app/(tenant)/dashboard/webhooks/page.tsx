"use client";

import { useState, type FormEvent } from "react";
import { Copy, Loader2, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { ErrorAlert } from "@/components/shared/error-alert";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useWebhookDeliveries,
  useWebhookDelivery,
  useWebhookEndpoints,
} from "@/features/webhooks/hooks/useWebhooks";
import type {
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEnvironment,
  WebhookEvent,
} from "@/features/webhooks/services/webhooks.service";

const webhookEvents: Array<{ value: WebhookEvent; label: string }> = [
  { value: "pago.creado", label: "Pago creado" },
  { value: "pago.aprobado", label: "Pago aprobado" },
  { value: "pago.rechazado", label: "Pago rechazado" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" });
}

function deliveryStatusLabel(status: WebhookDeliveryStatus, attemptCount = 0) {
  if (status === "delivered") return "Entregado";
  if (status === "failed") return "Fallido";
  return attemptCount > 0 ? "Reintentando" : "Pendiente";
}

function deliveryStatusStyle(status: WebhookDeliveryStatus) {
  if (status === "delivered") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function eventGroupKey(delivery: WebhookDelivery) {
  return delivery.eventId ?? `${delivery.eventType}-${delivery.createdAt}`;
}

function groupDeliveriesByEvent(deliveries: WebhookDelivery[]) {
  const groups = new Map<string, WebhookDelivery[]>();
  for (const delivery of deliveries) {
    const key = eventGroupKey(delivery);
    const group = groups.get(key);
    if (group) group.push(delivery);
    else groups.set(key, [delivery]);
  }
  return Array.from(groups.values());
}

export default function WebhooksPage() {
  const [url, setUrl] = useState("");
  const [environment, setEnvironment] = useState<WebhookEnvironment>("sandbox");
  const [eventTypes, setEventTypes] = useState<WebhookEvent[]>(["pago.creado"]);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const endpoints = useWebhookEndpoints();
  const deliveries = useWebhookDeliveries({ page: deliveryPage, pageSize: 20 });
  const deliveryDetail = useWebhookDelivery(selectedDeliveryId);

  const toggleEvent = (event: WebhookEvent) => {
    setEventTypes((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );
  };

  const createEndpoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setNotice("");
    setRevealedSecret(null);
    try {
      const endpoint = await endpoints.createEndpoint({ url, environment, eventTypes });
      setRevealedSecret(endpoint.secret);
      setNotice("Endpoint creado. Guarda el secreto ahora; no volverá a mostrarse.");
      setUrl("");
      setEventTypes(["pago.creado"]);
    } catch (error) {
      setActionError(error);
    }
  };

  const runEndpointAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setActionError(null);
    setNotice("");
    try {
      const result = await action();
      if (result && typeof result === "object" && "secret" in result && typeof result.secret === "string") {
        setRevealedSecret(result.secret);
        setNotice("Secreto rotado. Guarda el valor nuevo ahora; no volverá a mostrarse.");
      } else {
        setNotice(successMessage);
      }
    } catch (error) {
      setActionError(error);
    }
  };

  const copySecret = async () => {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret);
      setNotice("Secreto copiado al portapapeles.");
    } catch (error) {
      setActionError(error);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6" aria-labelledby="webhooks-title">
      <PageHeader
        title="Webhooks"
        description="Configura los destinos para eventos de pago y consulta el historial de entregas."
        icon={Webhook}
      />

      {actionError !== null && <ErrorAlert error={actionError} title="No pudimos completar la acción" />}
      {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {revealedSecret && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Secreto de firma</CardTitle>
            <CardDescription>Solo se muestra en esta respuesta. Guárdalo antes de salir de esta página.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted p-2 text-sm">{revealedSecret}</code>
            <Button type="button" variant="outline" onClick={copySecret}>
              <Copy aria-hidden className="size-4" /> Copiar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRevealedSecret(null)}>Ocultar</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registrar un endpoint</CardTitle>
          <CardDescription>El endpoint debe aceptar los eventos seleccionados y verificar la firma de FrogPay.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createEndpoint} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <label htmlFor="webhook-url" className="text-sm font-medium">URL de destino</label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://ejemplo.com/webhooks/frogpay"
                  required
                  maxLength={2048}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="webhook-environment" className="text-sm font-medium">Ambiente</label>
                <select
                  id="webhook-environment"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value as WebhookEnvironment)}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Producción</option>
                </select>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Eventos</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {webhookEvents.map((event) => (
                  <label key={event.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={eventTypes.includes(event.value)}
                      onChange={() => toggleEvent(event.value)}
                    />
                    {event.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" disabled={endpoints.isCreating || eventTypes.length === 0}>
              {endpoints.isCreating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
              Crear endpoint
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endpoints configurados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {endpoints.isLoading && <p className="text-sm text-muted-foreground">Cargando endpoints...</p>}
          {endpoints.isError && <ErrorAlert error={endpoints.error} title="No pudimos cargar los endpoints" />}
          {endpoints.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay endpoints registrados.</p>
          )}
          {endpoints.data?.map((endpoint) => (
            <article key={endpoint.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <p className="break-all font-medium">{endpoint.url}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{endpoint.environment === "sandbox" ? "Sandbox" : "Producción"}</Badge>
                    <Badge variant="outline" className={endpoint.isActive ? "text-emerald-700" : "text-muted-foreground"}>
                      {endpoint.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Eventos: {endpoint.eventTypes.join(", ")} · Creado {formatDate(endpoint.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={endpoints.isUpdating}
                    onClick={() => void runEndpointAction(
                      () => endpoints.updateEndpoint({
                        id: endpoint.id,
                        input: { isActive: !endpoint.isActive },
                      }),
                      endpoint.isActive ? "Endpoint desactivado." : "Endpoint activado.",
                    )}
                  >
                    {endpoint.isActive ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!endpoint.isActive || endpoints.isSendingTest}
                    onClick={() => void runEndpointAction(
                      () => endpoints.sendTest(endpoint.id),
                      "Evento de prueba encolado.",
                    )}
                  >
                    <Send aria-hidden className="size-3.5" /> Probar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={endpoints.isRotating}
                    onClick={() => void runEndpointAction(
                      () => endpoints.rotateSecret(endpoint.id),
                      "Secreto rotado.",
                    )}
                  >
                    <RefreshCw aria-hidden className="size-3.5" /> Rotar secreto
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={endpoints.isDeleting}
                    onClick={() => void runEndpointAction(
                      () => endpoints.deleteEndpoint(endpoint.id),
                      "Endpoint eliminado.",
                    )}
                  >
                    <Trash2 aria-hidden className="size-3.5" /> Eliminar
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de entregas</CardTitle>
          <CardDescription>
            {deliveries.data ? `${deliveries.data.total} entregas registradas. ` : "Últimas entregas de webhooks. "}
            Cada evento se envía a todos los endpoints suscritos: hay una fila por endpoint, no por reintento.
            Un fallo de entrega no cambia el estado del pago.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deliveries.isLoading && <p className="text-sm text-muted-foreground">Cargando historial...</p>}
          {deliveries.isError && <ErrorAlert error={deliveries.error} title="No pudimos cargar las entregas" />}
          {deliveries.data?.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay entregas registradas.</p>
          )}
          {deliveries.data && deliveries.data.data.length > 0 && (
            <div className="space-y-3">
              {groupDeliveriesByEvent(deliveries.data.data).map((group) => {
                const first = group[0];
                const delivered = group.filter((delivery) => delivery.status === "delivered").length;
                const failed = group.filter((delivery) => delivery.status === "failed").length;
                const pending = group.filter((delivery) => delivery.status === "pending").length;
                return (
                  <article key={eventGroupKey(first)} className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="font-mono text-sm">{first.eventType}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(first.createdAt)} · {group.length} {group.length === 1 ? "endpoint" : "endpoints"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {delivered > 0 && (
                          <Badge variant="outline" className={deliveryStatusStyle("delivered")}>
                            {delivered} entregado{delivered === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {failed > 0 && (
                          <Badge variant="outline" className={deliveryStatusStyle("failed")}>
                            {failed} fallido{failed === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {pending > 0 && (
                          <Badge variant="outline" className={deliveryStatusStyle("pending")}>
                            {pending} pendiente{pending === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {group.map((delivery) => (
                        <div
                          key={delivery.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 p-2"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="break-all text-xs font-medium">{delivery.webhookUrl}</p>
                            <p className="text-xs text-muted-foreground">
                              {delivery.attemptCount === 1 ? "1 intento" : `${delivery.attemptCount} intentos`}
                              {delivery.responseCode !== null ? ` · HTTP ${delivery.responseCode}` : ""}
                            </p>
                            {delivery.lastError && <p className="break-all text-xs text-destructive">{delivery.lastError}</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={deliveryStatusStyle(delivery.status)}>
                              {deliveryStatusLabel(delivery.status, delivery.attemptCount)}
                            </Badge>
                            {delivery.status === "failed" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={deliveries.isRetrying}
                                onClick={() => void runEndpointAction(
                                  () => deliveries.retryDelivery(delivery.id),
                                  "Reintento encolado.",
                                )}
                              >
                                {deliveries.isRetrying ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <RefreshCw aria-hidden className="size-3.5" />}
                                Reintentar
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedDeliveryId((current) => current === delivery.id ? "" : delivery.id)}
                            >
                              {selectedDeliveryId === delivery.id ? "Ocultar detalle" : "Ver detalle"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {selectedDeliveryId && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              {deliveryDetail.isLoading && <p className="text-sm text-muted-foreground">Cargando detalle...</p>}
              {deliveryDetail.isError && <ErrorAlert error={deliveryDetail.error} title="No pudimos cargar el detalle de la entrega" />}
              {deliveryDetail.data && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold">Endpoint</h3>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{deliveryDetail.data.webhookUrl}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Payload enviado</h3>
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-3 text-xs">
                      {JSON.stringify(deliveryDetail.data.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Intentos</h3>
                    {deliveryDetail.data.attempts.length === 0 && (
                      <p className="text-sm text-muted-foreground">Todavía no hay intentos registrados.</p>
                    )}
                    {deliveryDetail.data.attempts.map((attempt) => (
                      <p key={attempt.attemptNumber} className="text-xs text-muted-foreground">
                        Intento {attempt.attemptNumber} · {formatDate(attempt.createdAt)} ·{" "}
                        {attempt.succeeded ? "Correcto" : "Fallido"} · {attempt.responseCode ?? "Sin respuesta"} ·{" "}
                        {attempt.durationMs} ms
                        {attempt.error ? ` · ${attempt.error}` : ""}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {deliveries.data && deliveries.data.total > deliveries.data.pageSize && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Página {deliveries.data.page} de {Math.ceil(deliveries.data.total / deliveries.data.pageSize)}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deliveryPage <= 1 || deliveries.isFetching}
                  onClick={() => setDeliveryPage((page) => page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deliveryPage >= Math.ceil(deliveries.data.total / deliveries.data.pageSize) || deliveries.isFetching}
                  onClick={() => setDeliveryPage((page) => page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
