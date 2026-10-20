"use client";

import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorAlert } from "@/components/shared/error-alert";
import {
  formatAuditActor,
  formatAuditTransition,
  useAuditLogs,
} from "@/lib/api/audit-logs";
import { RATE_LIMIT_MESSAGE, isRateLimitError } from "@/lib/api/query-error";
import { formatLaPazDateTime } from "@/app/(tenant)/dashboard/pagos/transacciones/payment-format";
import { AuditActionBadge } from "@/app/(tenant)/dashboard/auditoria/components/audit-action-badge";

export function PaymentAuditTimeline({ paymentId }: { paymentId: string }) {
  const query = useAuditLogs({ paymentId, page: 1, limit: 100 });

  if (query.isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Auditoría</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4" aria-busy="true">
          <span className="sr-only">Cargando auditoría del pago…</span>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="ml-6 h-12 animate-pulse rounded-md bg-muted"
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Auditoría</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorAlert
            error={query.error}
            title="No pudimos cargar la auditoría del pago"
            message={isRateLimitError(query.error) ? RATE_LIMIT_MESSAGE : undefined}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            <RotateCcw aria-hidden className="size-4" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const records = [...(query.data?.data ?? [])].reverse();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Auditoría</CardTitle>
        <p className="text-xs text-muted-foreground">
          Los registros de auditoría no se pueden editar ni eliminar.
        </p>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <EmptyState
            title="Aún no hay registros de auditoría"
            description="Este pago aún no genera eventos de auditoría."
          />
        ) : (
          <ol className="relative space-y-6 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
            {records.map((record, index) => (
              <li key={record.eventId} className="relative">
                <span
                  className={`absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full ${
                    index === records.length - 1
                      ? "bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950"
                      : "bg-muted-foreground/40"
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <AuditActionBadge action={record.action} />
                  <span className="text-sm font-medium">
                    {formatAuditTransition(record.previousState, record.newState)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatLaPazDateTime(record.createdAt)} · {formatAuditActor(record.actor)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
