"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ErrorAlert } from "@/components/shared/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useWebhookDeliveries } from "@/features/webhooks/hooks/useWebhooks";

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" });
}

export function WebhookDeliveriesTable({
  paymentId,
  environment,
}: {
  paymentId: string;
  environment: "sandbox" | "production";
}) {
  const query = useWebhookDeliveries({ paymentId, page: 1, pageSize: 20 });

  return (
    <section className="mt-6 space-y-3" aria-labelledby="payment-webhook-deliveries">
      <h2 id="payment-webhook-deliveries" className="text-sm font-semibold text-foreground">
        Entregas Webhooks
      </h2>
      {query.isLoading && <p className="text-sm text-muted-foreground">Cargando entregas...</p>}
      {query.isError && <ErrorAlert error={query.error} title="No pudimos cargar las entregas del pago" />}
      {query.retryError && <ErrorAlert error={query.retryError} title="No pudimos reintentar la entrega" />}
      {query.data?.data.length === 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">Todavía no hay entregas de webhook asociadas a este pago.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Esto no significa que el pago QR haya fallado. Para crear una entrega debe haber un endpoint activo,
              suscrito a <code>pago.creado</code> en el ambiente {environment === "sandbox" ? "Sandbox" : "Producción"}.
              Si el endpoint se configuró después de crear el pago, ese evento no se envía retroactivamente.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Si ya tienes esa configuración, revisa el procesamiento del evento en el backend y vuelve a consultar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/webhooks" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Revisar configuración de webhooks
            </Link>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching
                ? <Loader2 aria-hidden className="size-4 animate-spin" />
                : <RefreshCw aria-hidden className="size-4" />}
              Actualizar entregas
            </Button>
          </div>
        </div>
      )}
      {query.data && query.data.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-4 border-b bg-muted/50 p-3 text-xs font-semibold text-muted-foreground">
            <div>Evento</div>
            <div className="text-center">Estado</div>
            <div className="text-center">Código HTTP</div>
            <div className="text-right">Fecha</div>
          </div>
          <div className="divide-y">
            {query.data.data.map((delivery) => (
              <div key={delivery.id} className="grid grid-cols-4 items-center gap-2 p-3 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-mono">{delivery.eventType}</p>
                  <p className="truncate text-muted-foreground" title={delivery.webhookUrl}>
                    {delivery.webhookUrl}
                  </p>
                  {delivery.lastError && <p className="truncate text-destructive">{delivery.lastError}</p>}
                </div>
                <div className="flex justify-center">
                  <Badge
                    variant="outline"
                    className={
                      delivery.status === "delivered"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : delivery.status === "failed"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {delivery.status === "delivered" ? "Entregado" : delivery.status === "failed" ? "Fallido" : "Pendiente"}
                  </Badge>
                </div>
                <div className="text-center font-mono">
                  {delivery.responseCode ?? "—"}
                </div>
                <div className="flex items-center justify-end gap-2 text-right text-muted-foreground">
                  {formatDate(delivery.createdAt)}
                  {delivery.status === "failed" && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Reintentar entrega"
                      disabled={query.isRetrying}
                      onClick={() => query.retryDeliveryNow(delivery.id)}
                    >
                      {query.isRetrying
                        ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                        : <RefreshCw aria-hidden className="size-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
