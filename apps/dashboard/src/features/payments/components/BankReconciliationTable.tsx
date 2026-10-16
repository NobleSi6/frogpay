'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert } from '@/components/shared/error-alert';
import { useReconciliation } from '../hooks/useReconciliation';
import { ReconciliationStatus } from '../services/reconciliation.service';

const statusConfig: Record<ReconciliationStatus, { label: string; className: string }> = {
  CONCILIATED: {
    label: 'Conciliado',
    className: 'bg-emerald-50 text-emerald-600 border-none font-medium',
  },
  WITHOUT_REFERENCE: {
    label: 'Sin referencia',
    className: 'bg-blue-50 text-blue-600 border-none font-medium',
  },
  AMOUNT_MISMATCH: {
    label: 'Monto distinto',
    className: 'bg-amber-50 text-amber-600 border-none font-medium',
  },
  CURRENCY_MISMATCH: {
    label: 'Moneda distinta',
    className: 'bg-amber-50 text-amber-600 border-none font-medium',
  },
};

export function BankReconciliationTable() {
  const [page, setPage] = useState(1);
  const { transactions, pagination, isLoading, isError, error } = useReconciliation(page);

  return (
    <Card className="shadow-sm border-slate-200/80 rounded-2xl bg-white">
      <CardHeader className="flex flex-row items-center justify-between pb-6">
        <CardTitle className="text-lg font-bold text-slate-900">
          Conciliacion Bancaria
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2 text-xs text-slate-600 font-normal">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Ultimos 30 dias
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 text-xs text-slate-600 font-normal">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            Filtrar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isError && (
          <div className="p-6">
            <ErrorAlert error={error} title="No pudimos cargar las transacciones bancarias" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-6">Referencia</th>
                <th className="py-3 px-6">Fecha</th>
                <th className="py-3 px-6">Banco</th>
                <th className="py-3 px-6 text-right">Monto</th>
                <th className="py-3 px-6 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Cargando depósitos bancarios...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No se encontraron depósitos.
                  </td>
                </tr>
              ) : (
                transactions.map((item) => {
                  const status = statusConfig[item.status];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 font-semibold text-slate-800">
                        {item.paymentId ? (
                          <Link 
                            href={`/dashboard/pagos/${encodeURIComponent(item.paymentId)}`}
                            className="hover:underline text-slate-900"
                          >
                            {item.reference}
                          </Link>
                        ) : (
                          item.reference
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-500 text-xs">{item.createdAt}</td>
                      <td className="py-4 px-6 text-slate-500 text-xs">{item.bankName}</td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900">
                        {item.currency} {item.amount.toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Badge variant="outline" className={`px-2.5 py-0.5 text-xs ${status.className}`}>
                          • {status.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
            <span>
              Página {pagination.page} de {pagination.totalPages} · {pagination.total} transacciones
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}