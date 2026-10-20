"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, QrCode } from "lucide-react";
import { ErrorAlert } from "@/components/shared/error-alert";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QrPaymentPanel } from "@/features/payments/components/QrPaymentPanel";
import { paymentsService, type QrPaymentResponse } from "@/features/payments/services/payments.service";

type DisplayQrPayment = QrPaymentResponse & {
  qrPayload: string;
  expiresAt: string;
};

export default function QrPaymentPage() {
  const [amount, setAmount] = useState("25.00");
  const [payment, setPayment] = useState<DisplayQrPayment | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [requestError, setRequestError] = useState<unknown>(null);

  const createPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setRequestError(null);

    try {
      const response = await paymentsService.createQrPayment({
        amount: Number(amount),
        currency: "BOB",
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.qrPayload || !response.expiresAt) {
        throw new Error("El proveedor no devolvió el código QR o su fecha de expiración.");
      }

      setPayment({
        ...response,
        qrPayload: response.qrPayload,
        expiresAt: response.expiresAt,
      });
    } catch (error) {
      setRequestError(error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="qr-payment-title">
      <PageHeader
        title="Pago con QR"
        description={
          payment
            ? "Escanea el código para completar el pago de prueba."
            : "Ingresa un monto para generar un código QR de prueba."
        }
        icon={QrCode}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/pagos" />} variant="outline" className="min-h-10">
            <ArrowLeft aria-hidden className="size-4" />
            Volver a métodos de pago
          </Button>
        }
      />

      {payment ? (
        <QrPaymentPanel
          paymentId={payment.id}
          qrPayload={payment.qrPayload}
          expiresAt={payment.expiresAt}
          onRetry={() => setPayment(null)}
        />
      ) : (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Generar código QR</CardTitle>
            <CardDescription>El pago se creará en el ambiente Sandbox.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createPayment} className="space-y-4">
              {requestError !== null && (
                <ErrorAlert error={requestError} title="No pudimos generar el pago QR" />
              )}
              <div className="space-y-2">
                <label htmlFor="qr-payment-amount" className="text-sm font-medium">Monto (BOB)</label>
                <Input
                  id="qr-payment-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    Generando código...
                  </>
                ) : (
                  "Generar QR de prueba"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
