"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE_OPTIONS } from "../payment-filters";
import { groupThousands } from "../payment-format";

function getPageItems(current: number, totalPages: number): Array<number | "gap"> {
  const pages: number[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1 || page === totalPages || Math.abs(page - current) <= 1) pages.push(page);
  }
  const items: Array<number | "gap"> = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - (pages[index - 1] as number) > 1) items.push("gap");
    items.push(page);
  });
  return items;
}

type TransactionsPaginationProps = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /** Etiqueta accesible del nav de paginación (por defecto, transacciones). */
  ariaLabel?: string;
  /** id del select de tamaño de página (por defecto, transacciones). */
  selectId?: string;
  /** Opciones de tamaño de página (por defecto, las de transacciones). */
  sizeOptions?: readonly number[];
};

export function TransactionsPagination({
  page,
  limit,
  total,
  totalPages,
  isFetching,
  onPageChange,
  onLimitChange,
  ariaLabel = "Paginación de transacciones",
  selectId = "tx-page-size",
  sizeOptions = PAGE_SIZE_OPTIONS,
}: TransactionsPaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <p aria-live="polite">
          Mostrando {groupThousands(String(from))}-{groupThousands(String(to))} de{" "}
          {groupThousands(String(total))}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-xs">
            Filas por página
          </label>
          <select
            id={selectId}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            {sizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav aria-label={ariaLabel} className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Anterior
        </Button>
        <ol className="hidden items-center gap-1 sm:flex">
          {getPageItems(page, totalPages).map((item, index) =>
            item === "gap" ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-xs text-muted-foreground">
                …
              </li>
            ) : (
              <li key={item}>
                <Button
                  type="button"
                  size="sm"
                  variant={item === page ? "secondary" : "ghost"}
                  aria-current={item === page ? "page" : undefined}
                  aria-label={`Ir a la página ${item}`}
                  disabled={isFetching}
                  onClick={() => onPageChange(item)}
                  className="min-w-8"
                >
                  {item}
                </Button>
              </li>
            ),
          )}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </nav>
    </div>
  );
}
