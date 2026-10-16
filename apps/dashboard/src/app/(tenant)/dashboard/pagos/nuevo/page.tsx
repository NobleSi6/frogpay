'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { StripeElementsProvider } from '@/features/payments/components/StripeElementsProvider';
import { CardPaymentForm } from '@/features/payments/components/CardPaymentForm';
import { useCreatePayment } from '@/features/payments/hooks/useCreatePayment';
import type { CreatePaymentInput } from '@/features/payments/services/payments.service';
import { useAuthSession } from '@/features/auth/auth-session';
import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NuevoPagoPage() {
  const router = useRouter();
  const session = useAuthSession();
  const businessName = session?.user.tenant?.name?.trim() || 'tu negocio';
  const createPaymentMutation = useCreatePayment();

  const [amount, setAmount] = React.useState('100.00');
  const [currency] = React.useState<string>('BOB');
  const [retryAttempt, setRetryAttempt] = React.useState<CreatePaymentInput | null>(null);
  const [requestError, setRequestError] = React.useState<unknown>(null);

  const sendPayment = async (attempt: CreatePaymentInput) => {
    setRequestError(null);
    try {
      const response = await createPaymentMutation.mutateAsync(attempt);
      setRetryAttempt(null);
      router.push(`/dashboard/pagos/${response.id}`);
    } catch (error) {
      setRetryAttempt(attempt);
      setRequestError(error);
    }
  };

  const handleTokenGenerated = async (paymentMethodId: string) => {
    await sendPayment({
      amount: Number(amount),
      currency,
      paymentMethodId,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo pago de prueba</h1>
        <p className="text-sm text-muted-foreground">
          Prueba tu integración en <span className="font-medium text-foreground">{businessName}</span>
        </p>
      </div>

      {retryAttempt ? (
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>No se confirmó el envío</CardTitle>
            <CardDescription>
              Puedes reintentar el mismo pago sin cambiar su clave de idempotencia, o descartar este intento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requestError !== null && <ErrorAlert error={requestError} />}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={createPaymentMutation.isPending}
                onClick={() => void sendPayment(retryAttempt)}
              >
                {createPaymentMutation.isPending ? 'Reintentando…' : 'Reintentar mismo pago'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={createPaymentMutation.isPending}
                onClick={() => {
                  setRetryAttempt(null);
                  setRequestError(null);
                }}
              >
                Iniciar otro intento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <StripeElementsProvider>
          <CardPaymentForm
            amount={amount}
            onAmountChange={setAmount}
            currency={currency}
            businessName={businessName}
            onTokenGenerated={handleTokenGenerated}
            isSubmitting={createPaymentMutation.isPending}
          />
        </StripeElementsProvider>
      )}
    </div>
  );
}