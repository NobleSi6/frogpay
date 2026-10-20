"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AUDIT_PAGE_SIZE_OPTIONS,
  useAuditLogs,
  type AuditLogRecord,
} from "@/lib/api/audit-logs";
import { TransactionsPagination } from "../../pagos/transacciones/components/transactions-pagination";
import {
  auditFiltersToApiParams,
  getDefaultAuditFilters,
  hasActiveAuditFilters,
  isInvalidPaymentIdFilter,
  parseAuditFilters,
  serializeAuditFilters,
  type AuditFilters,
} from "../audit-filters";
import { AuditFiltersBar } from "./audit-filters-bar";
import { AuditTable } from "./audit-table";
import { AuditRecordPanel } from "./audit-record-panel";

export function AuditScreen() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const filters = useMemo(() => parseAuditFilters(searchParams), [searchParams]);
  const params = useMemo(() => auditFiltersToApiParams(filters), [filters]);
  const query = useAuditLogs(params);
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);

  const activeFilters = hasActiveAuditFilters(filters);
  const paymentIdInvalid = isInvalidPaymentIdFilter(filters);

  const applyFilters = useCallback(
    (next: AuditFilters) => {
      const search = serializeAuditFilters(next);
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: Partial<AuditFilters>) => {
      applyFilters({ ...filters, ...patch, page: 1 });
    },
    [applyFilters, filters],
  );

  const clearFilters = useCallback(() => {
    applyFilters(getDefaultAuditFilters());
  }, [applyFilters]);

  const goToPage = useCallback(
    (page: number) => {
      applyFilters({ ...filters, page });
    },
    [applyFilters, filters],
  );

  const changeLimit = useCallback(
    (limit: number) => {
      applyFilters({ ...filters, limit, page: 1 });
    },
    [applyFilters, filters],
  );

  useEffect(() => {
    if (!query.data || query.isFetching) return;
    if (query.data.total > 0 && query.data.totalPages > 0 && filters.page > query.data.totalPages) {
      applyFilters({ ...filters, page: query.data.totalPages });
    }
  }, [applyFilters, filters, query.data, query.isFetching]);

  return (
    <section aria-labelledby="audit-title" className="space-y-6">
      <header className="space-y-3">
        <h1 id="audit-title" className="text-2xl font-bold tracking-tight">
          Auditoría
        </h1>
        <p
          role="note"
          className="flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 px-4 py-2 text-sm font-medium text-info"
        >
          <ShieldAlert aria-hidden className="size-4 shrink-0" />
          Los registros de auditoría no se pueden editar ni eliminar.
        </p>
      </header>

      <AuditFiltersBar
        filters={filters}
        hasActiveFilters={activeFilters || paymentIdInvalid}
        onChange={updateFilters}
        onClear={clearFilters}
      />

      {paymentIdInvalid && (
        <p role="alert" className="text-sm font-medium text-destructive">
          El filtro de pago debe ser un UUID válido (por ejemplo,
          3f2504e0-4f89-11d3-9a0c-0305e82c3301). El valor ingresado no se envió al servidor.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <AuditTable
            records={query.data?.data ?? []}
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            hasActiveFilters={activeFilters}
            onRetry={() => {
              void query.refetch();
            }}
            onSelect={setSelected}
          />
          {query.data && !query.isError && query.data.total > 0 && (
            <TransactionsPagination
              page={query.data.page}
              limit={query.data.limit}
              total={query.data.total}
              totalPages={query.data.totalPages}
              isFetching={query.isFetching}
              onPageChange={goToPage}
              onLimitChange={changeLimit}
              ariaLabel="Paginación de auditoría"
              selectId="audit-page-size"
              sizeOptions={AUDIT_PAGE_SIZE_OPTIONS}
            />
          )}
        </CardContent>
      </Card>

      {selected && <AuditRecordPanel record={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
