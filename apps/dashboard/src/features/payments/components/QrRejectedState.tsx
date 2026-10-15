import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrRejectedStateProps {
  onRetry: () => void;
}

export function QrRejectedState({ onRetry }: QrRejectedStateProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-4 py-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <X className="w-8 h-8 text-red-500 stroke-[3]" />
      </div>

      <h2 className="text-2xl font-bold text-slate-900">Pago rechazado</h2>

      <p className="text-sm text-slate-500 max-w-xs">
        Tu pago por QR fue rechazado. Genera un nuevo código e intenta de nuevo.
      </p>

      <Button onClick={onRetry} className="mt-4 bg-slate-800 hover:bg-slate-900 text-white px-6">
        Intentar de nuevo
      </Button>
    </div>
  );
}