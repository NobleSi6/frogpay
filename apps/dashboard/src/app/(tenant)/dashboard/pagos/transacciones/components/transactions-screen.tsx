"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { usePaymentsList, type PaymentSortBy } from "@/lib/api/payments";
import {
  filtersToApiParams,
  getDefaultTransactionFilters,
  hasActiveTransactionFilters,
  parseTransactionFilters,
  serializeTransactionFilters,
  type TransactionFilters,
} from "../payment-filters";
import { TransactionsFilters } from "./transactions-filters";
import { TransactionsTable } from "./transactions-table";
import { TransactionsPagination } from "./transactions-pagination";

export function TransactionsScreen() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const filters = useMemo(() => parseTransactionFilters(searchParams), [searchParams]);
  const params = useMemo(() => filtersToApiParams(filters), [filters]);
  const query = usePaymentsList(params);
  const activeFilters = hasActiveTransactionFilters(filters);

  const applyFilters = useCallback(
    (next: TransactionFilters) => {
      const search = serializeTransactionFilters(next);
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: Partial<TransactionFilters>) => {
      applyFilters({ ...filters, ...patch, page: 1 });
    },
    [applyFilters, filters],
  );

  const clearFilters = useCallback(() => {
    applyFilters(getDefaultTransactionFilters());
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

  const toggleSort = useCallback(
    (column: PaymentSortBy) => {
      if (filters.sortBy !== column) {
        updateFilters({ sortBy: column, sortOrder: column === "status" ? "asc" : "desc" });
        return;
      }
      updateFilters({ sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" });
    },
    [filters.sortBy, filters.sortOrder, updateFilters],
  );

  const data = query.data;

  useEffect(() => {
    if (!data || query.isFetching) return;
    if (data.total > 0 && data.totalPages > 0 && filters.page > data.totalPages) {
      applyFilters({ ...filters, page: data.totalPages });
    }
  }, [applyFilters, data, filters, query.isFetching]);

  return (
    <section className="space-y-6" aria-labelledby="transactions-title">
      <header className="space-y-2">
        <h1 id="transactions-title" className="text-2xl font-bold tracking-tight">
          Transacciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulta, filtra y ordena los pagos de tu negocio en un solo lugar.
        </p>
      </header>

      <TransactionsFilters
        filters={filters}
        hasActiveFilters={activeFilters}
        onChange={updateFilters}
        onClear={clearFilters}
      />

      <Card>
        <CardContent className="p-0">
          <TransactionsTable
            filters={filters}
            data={data}
            isLoading={query.isLoading}
            isFetching={query.isFetching}
            isError={query.isError}
            error={query.error}
            onRetry={() => void query.refetch()}
            onSort={toggleSort}
            onClearFilters={clearFilters}
          />
          {data && !query.isError && data.total > 0 && (
            <TransactionsPagination
              page={data.page}
              limit={data.limit}
              total={data.total}
              totalPages={data.totalPages}
              isFetching={query.isFetching}
              onPageChange={goToPage}
              onLimitChange={changeLimit}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
