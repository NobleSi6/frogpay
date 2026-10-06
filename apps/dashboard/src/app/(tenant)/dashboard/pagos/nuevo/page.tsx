'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { StripeElementsProvider } from '@/features/payments/components/StripeElementsProvider';
import { CardPaymentForm } from '@/features/payments/components/CardPaymentForm';
import { useCreatePayment } from '@/features/payments/hooks/useCreatePayment';
import { useAuthSession } from '@/features/auth/auth-session';

export default function NuevoPagoPage() {
  const router = useRouter();
  const session = useAuthSession();
  const businessName = session?.user.tenant?.name?.trim() || 'tu negocio';
  const createPaymentMutation = useCreatePayment();

  const [amount, setAmount] = React.useState('100.00');
  const [currency] = React.useState<string>('BOB');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleTokenGenerated = async (paymentMethodId: string) => {
    setErrorMessage(null);
    try {
      const response = await createPaymentMutation.mutateAsync({
        amount: Number(amount),
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
          Prueba tu integración en <span className="font-medium text-foreground">{businessName}</span>
        </p>
      </div>

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
      {errorMessage && (
        <p role="alert" className="mx-auto max-w-md text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}