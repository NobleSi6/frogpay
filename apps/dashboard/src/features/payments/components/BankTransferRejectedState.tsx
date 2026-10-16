import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { BankInstructions } from '../services/bank-transfer.service';

export function BankTransferRejectedState({
  paymentId,
  instructions,
  onRetry,
}: {
  paymentId: string;
  instructions: BankInstructions;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        Sandbox
      </Badge>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Transferencia bancaria de prueba</h2>
        <p className="text-xs text-slate-500">Valida tu integración con una transferencia bancaria de prueba.</p>
      </div>

      <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs text-left">
        <div className="flex justify-between"><span className="text-slate-500">Monto</span><span className="font-semibold">{instructions.amount}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Referencia</span><span className="font-mono font-bold">{instructions.reference}</span></div>
      </div>

      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
        <Badge variant="outline" className="bg-red-100 text-red-700 border-none mb-1 text-[10px]">
          Rechazado
        </Badge>
        <p className="text-xs font-medium text-red-800">La transferencia de prueba fue rechazada por inconsistencia en el monto.</p>
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
          Ver detalle
        </Link>
      </div>
    </div>
  );
}