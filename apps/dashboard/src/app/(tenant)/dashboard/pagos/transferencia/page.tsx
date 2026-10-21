"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Landmark, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/shared/error-alert";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BankTransferPanel } from "@/features/payments/components/BankTransferPanel";
import {
  bankTransferService,
  type BankTransferResponse,
} from "@/features/payments/services/bank-transfer.service";

type DisplayBankTransfer = BankTransferResponse;

export default function TransferenciaPaymentPage() {
  const [amount, setAmount] = useState("25.00");
  const [payment, setPayment] = useState<DisplayBankTransfer | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [requestError, setRequestError] = useState<unknown>(null);

  const createPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setRequestError(null);

    try {
      const response = await bankTransferService.createBankTransfer({
        amount: Number(amount),
        currency: "BOB",
        idempotencyKey: crypto.randomUUID(),
      });
      setPayment(response);
    } catch (error) {
      setRequestError(error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="bank-transfer-title">
      <PageHeader
        title="Pago por transferencia bancaria"
        description={
          payment
            ? "Usa estos datos de prueba para simular el depósito."
            : "Ingresa un monto para generar las instrucciones de transferencia."
        }
        icon={Landmark}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/pagos" />} variant="outline" className="min-h-10">
            <ArrowLeft aria-hidden className="size-4" />
            Volver a métodos de pago
          </Button>
        }
      />

      {payment ? (
        <BankTransferPanel
          paymentId={payment.id}
          instructions={payment.bankInstructions}
          expiresAt={payment.expiresAt}
          onRetry={() => setPayment(null)}
        />
      ) : (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Generar transferencia</CardTitle>
            <CardDescription>La operación se creará en el ambiente Sandbox.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createPayment} className="space-y-4">
              {requestError !== null && (
                <ErrorAlert error={requestError} title="No pudimos generar la transferencia" />
              )}
              <div className="space-y-2">
                <label htmlFor="bank-transfer-amount" className="text-sm font-medium">
                  Monto (BOB)
                </label>
                <Input
                  id="bank-transfer-amount"
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
                    Generando instrucciones...
                  </>
                ) : (
                  "Generar transferencia de prueba"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}