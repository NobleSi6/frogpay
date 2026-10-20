"use client";

import { useState } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorAlert } from "@/components/shared/error-alert";
import { EnvironmentBadge } from "@/components/shared/environment-indicator";
import {
  formatAuditActor,
  formatAuditTransition,
  type AuditLogRecord,
} from "@/lib/api/audit-logs";
import { RATE_LIMIT_MESSAGE, isRateLimitError } from "@/lib/api/query-error";
import { formatLaPazDateTime, shortPaymentId } from "../../pagos/transacciones/payment-format";
import { AuditActionBadge } from "./audit-action-badge";

const SKELETON_ROWS = 8;

type AuditTableProps = {
  records: AuditLogRecord[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onSelect: (record: AuditLogRecord) => void;
};

function CopyRequestId({ requestId }: { requestId: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!requestId) return <span className="text-muted-foreground">—</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(requestId as string);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <code className="max-w-28 truncate text-xs" title={requestId}>
        {requestId.slice(0, 8)}…
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Copiar requestId ${requestId}`}
        onClick={copy}
      >
        {copied ? (
          <Check aria-hidden className="size-3.5 text-emerald-500" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
      </Button>
    </span>
  );
}

export function AuditTable({
  records,
  isLoading,
  isError,
  error,
  hasActiveFilters,
  onRetry,
  onSelect,
}: AuditTableProps) {
  if (isError) {
    return (
      <div className="space-y-3 p-6">
        <ErrorAlert
          error={error}
          title="No pudimos cargar la auditoría"
          message={isRateLimitError(error) ? RATE_LIMIT_MESSAGE : undefined}
        />
        <Button type="button" variant="outline" onClick={onRetry}>
          <RotateCcw aria-hidden className="size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  if (!isLoading && records.length === 0) {
    return hasActiveFilters ? (
      <EmptyState
        title="Sin resultados"
        description="Prueba limpiando los filtros o ampliando el rango de fechas."
      />
    ) : (
      <EmptyState title="Aún no hay registros de auditoría" description="Los eventos de tu cuenta aparecerán aquí." />
    );
  }

  return (
    <div className={isLoading ? "opacity-60" : undefined}>
      <Table aria-label="Registros de auditoría">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Cambio de estado</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Request ID</TableHead>
            <TableHead>Ambiente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                <TableRow key={`skeleton-${index}`} aria-hidden="true">
                  {Array.from({ length: 8 }).map((__, cell) => (
                    <TableCell key={cell}>
                      <span className="block h-4 w-full max-w-24 animate-pulse rounded-md bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : records.map((record) => (
                <TableRow
                  key={record.eventId}
                  className="cursor-pointer"
                  onClick={() => onSelect(record)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="rounded-sm text-left text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(record);
                      }}
                    >
                      {formatLaPazDateTime(record.createdAt)}
                    </button>
                  </TableCell>
                  <TableCell>
                    <AuditActionBadge action={record.action} />
                  </TableCell>
                  <TableCell className="text-sm">{record.entity}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {record.entityId ? shortPaymentId(record.entityId) : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatAuditTransition(record.previousState, record.newState)}
                  </TableCell>
                  <TableCell className="text-sm">{formatAuditActor(record.actor)}</TableCell>
                  <TableCell>
                    <CopyRequestId requestId={record.requestId} />
                  </TableCell>
                  <TableCell>
                    <EnvironmentBadge
                      environment={record.environment === "production" ? "production" : "sandbox"}
                    />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
