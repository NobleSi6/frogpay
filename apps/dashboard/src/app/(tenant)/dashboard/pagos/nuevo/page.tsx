'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { StripeElementsProvider } from '@/features/payments/components/StripeElementsProvider';
import { CardPaymentForm } from '@/features/payments/components/CardPaymentForm';
import { useCreatePayment } from '@/features/payments/hooks/useCreatePayment';

export default function NuevoPagoPage() {
  const router = useRouter();
  const createPaymentMutation = useCreatePayment();

  const [amount] = React.useState<number>(100);
  const [currency] = React.useState<string>('BOB');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleTokenGenerated = async (paymentMethodId: string) => {
    setErrorMessage(null);
    try {
      const response = await createPaymentMutation.mutateAsync({
        amount,
        currency,
        paymentMethodId,
      });

      router.push(`/dashboard/pagos/${response.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el pago. Inténtalo de nuevo.',
      );
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo pago de prueba</h1>
        <p className="text-sm text-muted-foreground">
          Prueba tu integración en <span className="font-medium text-foreground">Acme Pagos</span>
        </p>
      </div>

      <StripeElementsProvider>
        <CardPaymentForm
          amount={amount}
          currency={currency}
          onTokenGenerated={handleTokenGenerated}
          isSubmitting={createPaymentMutation.isPending}
        />
      </StripeElementsProvider>
      {errorMessage && (
        <p role="alert" className="mx-auto max-w-md text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}