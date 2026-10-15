'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { BankInstructions, BankSimulationType } from '../services/bank-transfer.service';

interface BankTransferPendingStateProps {
  instructions: BankInstructions;
  expiresAt: string;
  onSimulateDeposit: (type: BankSimulationType) => void;
  onExpire: () => void;
  isSimulating?: boolean;
}

export function BankTransferPendingState({
  instructions,
  expiresAt,
  onSimulateDeposit,
  onExpire,
  isSimulating,
}: BankTransferPendingStateProps) {
  const [copied, setCopied] = useState(false);
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

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(instructions.reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          Sandbox
        </Badge>
        <h2 className="text-xl font-bold text-slate-900">Nuevo pago de prueba</h2>
        <p className="text-xs text-slate-500">Valida tu integración con una transferencia bancaria.</p>
      </div>

      {/* Banner de Advertencia Sandbox */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-amber-800 text-xs">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Los pagos no son reales</p>
          <p className="text-amber-700">No se realizarán cargos a ninguna cuenta.</p>
        </div>
      </div>

      {/* Ficha con Datos Bancarios */}
      <div className="space-y-3 border-t border-b border-slate-100 py-4 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Banco</span>
          <span className="font-medium text-slate-900">{instructions.bankName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Cuenta</span>
          <span className="font-medium text-slate-900 font-mono">{instructions.accountNumber}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Titular</span>
          <span className="font-medium text-slate-900">{instructions.accountHolder}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Monto</span>
          <span className="font-semibold text-slate-900">{instructions.amount}</span>
        </div>
        <div className="flex justify-between items-center pt-1">
          <span className="text-slate-500">Referencia</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-900">{instructions.reference}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 px-2.5"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Expira en <strong className="font-mono text-slate-700">{formattedTime}</strong></span>
        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-none">
          Pendiente
        </Badge>
      </div>

      {/* SIMULADOR DE BANCO (SOLO SANDBOX) */}
      <div className="w-full mt-6 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2.5">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider text-center mb-1">
          Simulador de banco (Solo Sandbox)
        </p>
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-9"
          onClick={() => onSimulateDeposit('EXACT')}
          disabled={isSimulating}
        >
          Simular depósito exacto
        </Button>
        <Button
          className="w-full bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium text-xs h-9 border border-amber-300"
          onClick={() => onSimulateDeposit('DIFFERENT_AMOUNT')}
          disabled={isSimulating}
        >
          Simular depósito con montos diferentes
        </Button>
        <Button
          className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-medium text-xs h-9 border border-red-200"
          onClick={() => onSimulateDeposit('UNKNOWN_REFERENCE')}
          disabled={isSimulating}
        >
          Simular depósito con referencia desconocida
        </Button>
      </div>
    </div>
  );
}