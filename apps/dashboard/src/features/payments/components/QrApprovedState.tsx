import { Check } from "lucide-react";
import Link from "next/link";

interface QrApprovedStateProps {
  paymentId: string;
}

export function QrApprovedState({ paymentId }: QrApprovedStateProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-4 py-4">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
        <Check className="w-8 h-8 text-emerald-600 stroke-[3]" />
      </div>

      <h2 className="text-2xl font-bold text-slate-900">Pago aprobado</h2>

      <p className="text-sm text-slate-500 max-w-xs">
        Tu pago por QR se procesó correctamente en el ambiente sandbox.
      </p>

      <Link
        href={`/dashboard/pagos/${encodeURIComponent(paymentId)}`}
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-ring"
      >
        Ver detalle de la transacción
      </Link>
    </div>
  );
}