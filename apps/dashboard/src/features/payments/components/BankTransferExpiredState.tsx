import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export function BankTransferExpiredState({
  paymentId,
  onRetry,
}: {
  paymentId: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        Sandbox
      </Badge>

      <div>
        <h2 className="text-xl font-bold text-slate-900">Transferencia bancaria</h2>
        <p className="text-xs text-slate-500">Consulta la operación expirada.</p>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
        <Badge variant="outline" className="bg-slate-200 text-slate-600 border-none text-[10px]">
          Expirado
        </Badge>
        <p className="text-sm font-semibold text-slate-800">La transferencia venció sin recibir el depósito.</p>
        <p className="text-xs text-slate-500">Esta operación ya no puede completarse.</p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="min-h-10 w-full rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Generar otra transferencia
        </button>
        <Link
          href={`/dashboard/pagos/${encodeURIComponent(paymentId)}`}
          className="inline-flex min-h-10 items-center justify-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Ver detalle de la transacción
        </Link>
      </div>
    </div>
  );
}