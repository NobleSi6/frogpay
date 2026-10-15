import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { BankInstructions } from '../services/bank-transfer.service';

export function BankTransferApprovedState({
  paymentId,
  instructions,
}: {
  paymentId: string;
  instructions: BankInstructions;
}) {
  return (
    <div className="space-y-6 text-center">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        Sandbox
      </Badge>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Transferencia bancaria</h2>
        <p className="text-xs text-slate-500">Valida tu integración con datos de prueba.</p>
      </div>

      <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs text-left">
        <div className="flex justify-between"><span className="text-slate-500">Banco</span><span>{instructions.bankName}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Cuenta</span><span className="font-mono">{instructions.accountNumber}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Monto</span><span className="font-semibold">{instructions.amount}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Referencia</span><span className="font-mono font-bold">{instructions.reference}</span></div>
      </div>

      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-left">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-emerald-600 stroke-[3]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-900">Transferencia aprobada</p>
          <p className="text-[11px] text-emerald-700">La transferencia bancaria de prueba se procesó correctamente.</p>
        </div>
      </div>

      <Link
        href={`/dashboard/pagos/${encodeURIComponent(paymentId)}`}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Ver detalle
      </Link>
    </div>
  );
}