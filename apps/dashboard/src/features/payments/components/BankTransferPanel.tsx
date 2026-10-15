'use client';

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorAlert } from '@/components/shared/error-alert';
import { Card, CardContent } from '@/components/ui/card';
import { useBankTransfer } from '../hooks/useBankTransfer';
import type { BankInstructions } from '../services/bank-transfer.service';
import { BankTransferApprovedState } from './BankTransferApprovedState';
import { BankTransferExpiredState } from './BankTransferExpiredState';
import { BankTransferPendingState } from './BankTransferPendingState';
import { BankTransferRejectedState } from './BankTransferRejectedState';

interface BankTransferPanelProps {
  paymentId: string;
  instructions: BankInstructions;
  expiresAt: string;
  onRetry: () => void;
}

export function BankTransferPanel({
  paymentId,
  instructions,
  expiresAt,
  onRetry,
}: BankTransferPanelProps) {
  const {
    status,
    simulateDeposit,
    isSimulating,
    simulationError,
    expirePayment,
    isLoading,
    isError,
    error,
  } = useBankTransfer(paymentId);
  const handleExpire = useCallback(() => expirePayment(), [expirePayment]);

  return (
    <Card className="mx-auto max-w-md rounded-2xl border-slate-200/80 p-6 shadow-sm">
      <CardContent className="space-y-4 p-0">
        {isError && <ErrorAlert error={error} title="No pudimos cargar la transferencia" />}
        {simulationError && <ErrorAlert error={simulationError} title="No pudimos simular el depósito" />}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 aria-hidden className="size-7 animate-spin" />
            <p className="text-sm">Cargando transferencia...</p>
          </div>
        )}
        {status === 'PENDING' && (
          <BankTransferPendingState
            instructions={instructions}
            expiresAt={expiresAt}
            onSimulateDeposit={simulateDeposit}
            onExpire={handleExpire}
            isSimulating={isSimulating}
          />
        )}
        {status === 'APPROVED' && (
          <BankTransferApprovedState paymentId={paymentId} instructions={instructions} />
        )}
        {(status === 'REJECTED' || status === 'FAILED') && (
          <BankTransferRejectedState
            paymentId={paymentId}
            instructions={instructions}
            onRetry={onRetry}
          />
        )}
        {status === 'EXPIRED' && (
          <BankTransferExpiredState paymentId={paymentId} onRetry={onRetry} />
        )}
      </CardContent>
    </Card>
  );
}
