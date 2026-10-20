"use client";

import { FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIT_ACTION_OPTIONS } from "@/lib/api/audit-logs";
import { getDateRangeShortcut } from "../../pagos/transacciones/payment-filters";
import { AUDIT_DATE_SHORTCUTS, type AuditFilters } from "../audit-filters";

const fieldClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

type AuditFiltersBarProps = {
  filters: AuditFilters;
  hasActiveFilters: boolean;
  onChange: (patch: Partial<AuditFilters>) => void;
  onClear: () => void;
};

export function AuditFiltersBar({
  filters,
  hasActiveFilters,
  onChange,
  onClear,
}: AuditFiltersBarProps) {
  const actionOptions = [...AUDIT_ACTION_OPTIONS];
  if (filters.action && !actionOptions.some((option) => option.value === filters.action)) {
    actionOptions.push({ value: filters.action, label: filters.action });
  }

  return (
    <section
      aria-label="Filtros de auditoría"
      className="space-y-4 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor="audit-payment-id" className="text-sm font-medium">
            Pago (UUID)
          </label>
          <input
            id="audit-payment-id"
            type="text"
            value={filters.paymentId}
            onChange={(event) => onChange({ paymentId: event.target.value })}
            placeholder="UUID del pago"
            className={fieldClassName}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="audit-action" className="text-sm font-medium">
            Acción
          </label>
          <select
            id="audit-action"
            className={fieldClassName}
            value={filters.action}
            onChange={(event) => onChange({ action: event.target.value })}
          >
            {actionOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="audit-from" className="text-sm font-medium">
            Desde (día local)
          </label>
          <input
            id="audit-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ from: event.target.value })}
            className={fieldClassName}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="audit-to" className="text-sm font-medium">
            Hasta (día local)
          </label>
          <input
            id="audit-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ to: event.target.value })}
            className={fieldClassName}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Atajos:</span>
          {AUDIT_DATE_SHORTCUTS.map((shortcut) => (
            <Button
              key={shortcut.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const range = getDateRangeShortcut(shortcut.value);
                onChange({ from: range.from, to: range.to });
              }}
            >
              {shortcut.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={onClear}
          disabled={!hasActiveFilters}
        >
          <FilterX aria-hidden className="size-4" />
          Limpiar filtros
        </Button>
      </div>
    </section>
  );
}
