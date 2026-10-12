"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SPRINT1_DEMO_MODE } from "@/lib/demo-mode";

interface QrPendingStateProps {
  qrPayload: string;
  expiresAt: string;
  amount: number;
  currency: string;
  onSimulate: (result: "APPROVED" | "FAILED") => void;
  onExpire: () => void;
  isSimulating?: boolean;
}

export function QrPendingState({
  qrPayload,
  expiresAt,
  amount,
  currency,
  onSimulate,
  onExpire,
  isSimulating,
}: QrPendingStateProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const targetTime = new Date(expiresAt).getTime();
    let hasExpired = false;

    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = Math.max(0, Math.floor((targetTime - now) / 1000));
      setTimeLeft(difference);

      if (difference === 0 && !hasExpired) {
        hasExpired = true;
        onExpire();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Escanea para pagar</h2>

      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="p-2 bg-white rounded-xl border border-slate-100 flex items-center justify-center">
          <QRCode value={qrPayload || "frogpay-demo-payload"} size={180} />
        </div>
      </div>

      <p className="text-lg font-semibold text-slate-900">
        {amount.toFixed(2)} {currency}
      </p>
      <p className="text-sm text-slate-500 font-medium">
        Expira en <span className="font-mono text-slate-700">{formattedTime}</span>
      </p>

      <Badge variant="outline" className="bg-slate-100 text-slate-600 border-none px-3 py-1 text-xs">
        Pendiente
      </Badge>

      {SPRINT1_DEMO_MODE && (
        <div className="w-full mt-6 p-4 bg-slate-50/80 rounded-xl border border-dashed border-slate-200 space-y-3">
          <p className="text-xs text-slate-500 font-medium">Simulador (solo sandbox)</p>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            onClick={() => onSimulate("APPROVED")}
            disabled={isSimulating}
          >
            {isSimulating ? "Procesando..." : "Simular pago aprobado"}
          </Button>
          <Button
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium"
            onClick={() => onSimulate("FAILED")}
            disabled={isSimulating}
          >
            {isSimulating ? "Procesando..." : "Simular pago fallido"}
          </Button>
        </div>
      )}
    </div>
  );
}