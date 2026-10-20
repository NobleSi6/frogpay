"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ENVIRONMENT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  STATUS_OPTIONS,
  getDateRangeShortcut,
  type DateShortcut,
  type TransactionFilters,
} from "../payment-filters";

const fieldClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

type TransactionsFiltersProps = {
  filters: TransactionFilters;
  hasActiveFilters: boolean;
  onChange: (patch: Partial<TransactionFilters>) => void;
  onClear: () => void;
};

export function TransactionsFilters({ filters, hasActiveFilters, onChange, onClear }: TransactionsFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search);
  const lastSentSearch = useRef(filters.search);

  useEffect(() => {
    if (filters.search !== lastSentSearch.current) {
      lastSentSearch.current = filters.search;
      setSearchValue(filters.search);
    }
  }, [filters.search]);

  useEffect(() => {
    if (searchValue === lastSentSearch.current) return;
    const timeout = setTimeout(() => {
      lastSentSearch.current = searchValue;
      onChange({ search: searchValue });
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchValue, onChange]);

  const applyShortcut = (shortcut: DateShortcut) => {
    const range = getDateRangeShortcut(shortcut);
    onChange({ from: range.from, to: range.to });
  };

  return (
    <section aria-label="Filtros de transacciones" className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="tx-status" label="Estado" className="min-w-44 flex-1">
          <select
            id="tx-status"
            className={fieldClassName}
            value={filters.status}
            onChange={(event) => onChange({ status: event.target.value as TransactionFilters["status"] })}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="tx-method" label="Método" className="min-w-44 flex-1">
          <select
            id="tx-method"
            className={fieldClassName}
            value={filters.paymentMethod}
            onChange={(event) =>
              onChange({ paymentMethod: event.target.value as TransactionFilters["paymentMethod"] })
            }
          >
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="tx-environment" label="Ambiente" className="min-w-44 flex-1">
          <select
            id="tx-environment"
            className={fieldClassName}
            value={filters.environment}
            onChange={(event) =>
              onChange({ environment: event.target.value as TransactionFilters["environment"] })
            }
          >
            {ENVIRONMENT_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="tx-search" label="Búsqueda" className="min-w-56 flex-[2]">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tx-search"
              type="search"
              className="pl-8"
              placeholder="Referencia o ID del pago"
              autoComplete="off"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>
        </Field>

        <Button
          type="button"
          variant="outline"
          className="h-8"
          disabled={!hasActiveFilters}
          onClick={onClear}
        >
          <X aria-hidden className="size-4" />
          Limpiar filtros
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field id="tx-from" label="Desde" className="w-40">
          <Input
            id="tx-from"
            type="date"
            max={filters.to || undefined}
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
          />
        </Field>
        <Field id="tx-to" label="Hasta" className="w-40">
          <Input
            id="tx-to"
            type="date"
            min={filters.from || undefined}
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </Field>
        <div role="group" aria-label="Atajos de rango de fechas" className="flex flex-wrap gap-2 pb-0.5">
          <Button type="button" size="sm" variant="outline" onClick={() => applyShortcut("today")}>
            Hoy
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyShortcut("last7")}>
            7 días
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyShortcut("last30")}>
            30 días
          </Button>
        </div>
      </div>
    </section>
  );
}
