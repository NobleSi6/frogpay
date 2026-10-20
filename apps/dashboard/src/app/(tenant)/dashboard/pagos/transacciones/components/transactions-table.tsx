"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorAlert } from "@/components/shared/error-alert";
import { EnvironmentBadge } from "@/components/shared/environment-indicator";
import type { PaymentListResponse, PaymentSortBy, PaymentStatus } from "@/lib/api/payments";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  hasActiveTransactionFilters,
  type TransactionFilters,
} from "../payment-filters";
import { formatDecimalAmount, formatLaPazDateTime, shortPaymentId } from "../payment-format";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "bg-muted text-muted-foreground",
  refunded: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  partially_refunded: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

const SKELETON_ROWS = 8;

function getErrorDetails(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
  return { code, status, isRateLimit: code === "rate_limit_exceeded" || status === 429 };
}

function SortHeader({
  label,
  column,
  filters,
  onSort,
  align,
}: {
  label: string;
  column: PaymentSortBy;
  filters: TransactionFilters;
  onSort: (column: PaymentSortBy) => void;
  align?: "end";
}) {
  const active = filters.sortBy === column;
  const ariaSort = active ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHead scope="col" aria-sort={ariaSort} className={align === "end" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex w-full items-center gap-1 rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${
          align === "end" ? "justify-end" : "justify-start"
        } ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        {label}
        {active ? (
          filters.sortOrder === "asc" ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden className="size-3.5" />
          )
        ) : (
          <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />
        )}
        <span className="sr-only">{active ? (filters.sortOrder === "asc" ? "(orden ascendente)" : "(orden descendente)") : "(sin ordenar)"}</span>
      </button>
    </TableHead>
  );
}

type TransactionsTableProps = {
  filters: TransactionFilters;
  data: PaymentListResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onSort: (column: PaymentSortBy) => void;
  onClearFilters: () => void;
};

export function TransactionsTable({
  filters,
  data,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
  onSort,
  onClearFilters,
}: TransactionsTableProps) {
  const router = useRouter();

  if (isError) {
    const { code, isRateLimit } = getErrorDetails(error);
    return (
      <div className="space-y-4 p-6">
        <ErrorAlert
          error={error}
          code={code}
          title="No pudimos cargar las transacciones"
          message={
            isRateLimit ? "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo." : undefined
          }
          action={isRateLimit ? "Espera unos segundos y vuelve a intentarlo." : undefined}
        />
        <Button type="button" variant="outline" onClick={onRetry}>
          <RotateCcw aria-hidden className="size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  if (!isLoading && data && data.data.length === 0) {
    return hasActiveTransactionFilters(filters) ? (
      <EmptyState
        title="Sin resultados. Prueba limpiando los filtros"
        description="Ninguna transacción coincide con los filtros aplicados."
        icon={<ArrowUpDown aria-hidden className="size-5" />}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            <RotateCcw aria-hidden className="size-4" />
            Limpiar filtros
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="Aún no tienes transacciones"
        description="Crea un pago de prueba para verlo aparecer en esta lista."
        action={
          <Button type="button" size="sm" onClick={() => router.push("/dashboard/pagos/nuevo")}>
            <Plus aria-hidden className="size-4" />
            Crear pago de prueba
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto" aria-busy={isFetching}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">ID</TableHead>
            <TableHead scope="col">Referencia</TableHead>
            <SortHeader label="Monto" column="amount" filters={filters} onSort={onSort} align="end" />
            <TableHead scope="col">Método</TableHead>
            <SortHeader label="Estado" column="status" filters={filters} onSort={onSort} />
            <TableHead scope="col" className="text-right">Comisión</TableHead>
            <TableHead scope="col" className="text-right">Neto</TableHead>
            <TableHead scope="col">Ambiente</TableHead>
            <SortHeader label="Fecha" column="createdAt" filters={filters} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody className={isFetching ? "opacity-60 transition-opacity" : undefined}>
          {isLoading ? (
            Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={`skeleton-${index}`} aria-hidden="true">
                {Array.from({ length: 9 }, (_, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <span className="block h-4 w-full max-w-24 animate-pulse rounded-md bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            (data?.data ?? []).map((payment) => (
              <TableRow
                key={payment.id}
                className="cursor-pointer"
                onClick={() => router.push(`/dashboard/pagos/${encodeURIComponent(payment.id)}`)}
              >
                <TableCell>
                  <Link
                    href={`/dashboard/pagos/${encodeURIComponent(payment.id)}`}
                    aria-label={`Ver detalle del pago ${payment.id}`}
                    className="rounded-sm font-mono text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {shortPaymentId(payment.id)}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">{payment.merchantReference}</TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold tabular-nums">{formatDecimalAmount(payment.amount)}</span>{" "}
                  <span className="text-xs text-muted-foreground">{payment.currency}</span>
                </TableCell>
                <TableCell>{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`border-none px-2 py-0.5 ${STATUS_STYLES[payment.status]}`}>
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimalAmount(payment.commissionAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatDecimalAmount(payment.netAmount)}</TableCell>
                <TableCell>
                  <EnvironmentBadge environment={payment.environment} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatLaPazDateTime(payment.createdAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
