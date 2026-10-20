"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditLogRecord } from "@/lib/api/audit-logs";
import { EnvironmentBadge } from "@/components/shared/environment-indicator";
import { AuditActionBadge } from "./audit-action-badge";
import { formatAuditActor, formatAuditStateJson, formatAuditTransition } from "@/lib/api/audit-logs";
import { formatLaPazDateTime } from "../../pagos/transacciones/payment-format";

type AuditRecordPanelProps = {
  record: AuditLogRecord;
  onClose: () => void;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function AuditRecordPanel({ record, onClose }: AuditRecordPanelProps) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyRequestId() {
    if (!record.requestId) return;
    try {
      await navigator.clipboard.writeText(record.requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar el detalle del registro"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-panel-title"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-card shadow-xl"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b bg-card px-5 py-4">
          <h2 id="audit-panel-title" className="text-base font-semibold">
            Detalle del registro
          </h2>
          <Button ref={closeRef} type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <Field label="Fecha y hora (America/La_Paz)">
            <p className="font-medium">{formatLaPazDateTime(record.createdAt)}</p>
            <p className="text-xs text-muted-foreground">UTC: {record.createdAt}</p>
          </Field>

          <Field label="Acción">
            <AuditActionBadge action={record.action} />
            <p className="mt-1 font-mono text-xs text-muted-foreground">{record.action}</p>
          </Field>

          <Field label="Entidad">
            <p className="font-medium">{record.entity}</p>
          </Field>

          <Field label="ID de la entidad">
            <p className="break-all font-mono text-xs">{record.entityId ?? "—"}</p>
          </Field>

          <Field label="Cambio de estado">
            <p className="font-medium">{formatAuditTransition(record.previousState, record.newState)}</p>
          </Field>

          <Field label="Estado anterior">
            <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
              {formatAuditStateJson(record.previousState)}
            </pre>
          </Field>

          <Field label="Estado nuevo">
            <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
              {formatAuditStateJson(record.newState)}
            </pre>
          </Field>

          <Field label="Actor">
            <p className="font-medium">{formatAuditActor(record.actor)}</p>
          </Field>

          <Field label="Request ID">
            {record.requestId ? (
              <div className="flex items-center gap-2">
                <code className="break-all text-xs">{record.requestId}</code>
                <Button type="button" variant="outline" size="xs" onClick={copyRequestId}>
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            ) : (
              <p>—</p>
            )}
          </Field>

          <Field label="Ambiente">
            <EnvironmentBadge environment={record.environment === "production" ? "production" : "sandbox"} />
          </Field>

          <Field label="ID del evento">
            <p className="break-all font-mono text-xs">{record.eventId}</p>
          </Field>
        </div>
      </aside>
    </div>
  );
}
