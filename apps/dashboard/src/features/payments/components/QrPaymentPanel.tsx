"use client";

import { useCallback } from "react";
import { Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/shared/error-alert";
import { Card, CardContent } from "@/components/ui/card";
import { useQrPayment } from "../hooks/useQrPayment";
import { QrApprovedState } from "./QrApprovedState";
import { QrExpiredState } from "./QrExpiredState";
import { QrPendingState } from "./QrPendingState";
import { QrRejectedState } from "./QrRejectedState";

interface QrPaymentPanelProps {
  paymentId: string;
  qrPayload: string;
  expiresAt: string;
  onRetry: () => void;
}

export function QrPaymentPanel({
  paymentId,
  qrPayload,
  expiresAt,
  onRetry,
}: QrPaymentPanelProps) {
  const {
    data,
    status,
    simulatePayment,
    isSimulating,
    simulationError,
    expirePayment,
    isLoading,
    isError,
    error,
  } = useQrPayment(paymentId);
  const handleExpire = useCallback(() => expirePayment(), [expirePayment]);

  return (
    <Card className="mx-auto max-w-md rounded-2xl border-slate-200/80 p-6 shadow-sm">
      <CardContent className="space-y-4 p-0">
        {isError && <ErrorAlert error={error} title="No pudimos cargar el pago QR" />}
        {simulationError && <ErrorAlert error={simulationError} title="No pudimos actualizar el pago" />}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 aria-hidden className="size-7 animate-spin" />
            <p className="text-sm">Cargando pago QR...</p>
          </div>
        )}
        {status === "PENDING" && (
          <QrPendingState
            qrPayload={qrPayload}
            expiresAt={expiresAt}
            amount={data?.amount ?? 0}
            currency={data?.currency ?? "BOB"}
            onSimulate={simulatePayment}
            onExpire={handleExpire}
            isSimulating={isSimulating}
          />
        )}
        {status === "APPROVED" && <QrApprovedState paymentId={paymentId} />}
        {(status === "REJECTED" || status === "FAILED") && (
          <QrRejectedState onRetry={onRetry} />
        )}
        {status === "EXPIRED" && <QrExpiredState onReset={onRetry} />}
      </CardContent>
    </Card>
  );
}
