import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface QrExpiredStateProps {
  onReset: () => void;
}

export function QrExpiredState({ onReset }: QrExpiredStateProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Escanea para pagar</h2>

      <div className="p-4 bg-slate-100/80 rounded-2xl border border-slate-200">
        <div className="w-48 h-48 bg-slate-200/60 flex items-center justify-center rounded-xl">
          <span className="text-slate-500 font-semibold text-base">Código expirado</span>
        </div>
      </div>

      <Badge variant="outline" className="bg-slate-100 text-slate-500 border-none px-3 py-1">
        Expirado
      </Badge>

      <Button onClick={onReset} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
        Generar nuevo código
      </Button>
    </div>
  );
}