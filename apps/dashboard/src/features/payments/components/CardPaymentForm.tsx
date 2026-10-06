'use client';

import * as React from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from '@/components/ui/card';
import { AlertTriangle, Loader2, Check, Lock } from 'lucide-react';

interface CardPaymentFormProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  currency?: string;
  businessName: string;
  onTokenGenerated: (paymentMethodId: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function CardPaymentForm({
  amount,
  onAmountChange,
  currency = 'BOB',
  businessName,
  onTokenGenerated,
  isSubmitting = false,
}: CardPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isComplete, setIsComplete] = React.useState<boolean>(false);
  const [isProcessingToken, setIsProcessingToken] = React.useState<boolean>(false);
  const parsedAmount = Number(amount);
  const isAmountValid =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    /^\d+(\.\d{1,2})?$/.test(amount);

  // Manejo tipado de cambios en la tarjeta sin utilizar 'any'
  const handleCardChange = (event: StripeCardElementChangeEvent) => {
    setIsComplete(event.complete);
    if (event.error) {
      setErrorMessage(event.error.message);
    } else {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setIsProcessingToken(true);
    setErrorMessage(null);

    try {
      // Tokenización segura en el cliente (PCI DSS SAQ A)
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (error) {
        setErrorMessage(error.message || 'Error al procesar la tarjeta.');
        setIsProcessingToken(false);
        return;
      }

      if (paymentMethod) {
        await onTokenGenerated(paymentMethod.id);
      }
    } catch (err) {
      setErrorMessage('Ocurrió un error inesperado al generar el token de pago.');
    } finally {
      setIsProcessingToken(false);
    }
  };

  const isLoading = isSubmitting || isProcessingToken;

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl">
      <CardHeader>
        <CardTitle>Nuevo pago de prueba</CardTitle>
        <CardDescription>
          Valida la integración de {businessName} con una tarjeta en modo Sandbox.
        </CardDescription>
        <CardAction>
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            Modo Sandbox
          </span>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold">Los pagos no son reales</p>
            <p className="text-amber-700 dark:text-amber-300">
              No se realizarán cargos a ninguna tarjeta.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Monto
            </label>
            <input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              aria-invalid={!isAmountValid}
              aria-describedby="payment-amount-help"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p id="payment-amount-help" className="mt-1 text-xs text-muted-foreground">
              Ingresa un monto mayor que cero, con hasta dos decimales.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Moneda
            </label>
            <div className="rounded-md border border-input bg-muted/20 px-3 py-2 text-sm font-semibold text-foreground uppercase">
              {currency}
            </div>
          </div>
        </div>

        {/* Formulario de Tarjeta con Stripe Elements */}
        <form id="payment-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Tarjeta
            </label>
            <div
              className={`relative rounded-lg border p-3 transition-all duration-200 ${
                errorMessage
                  ? 'border-destructive bg-destructive/5 ring-1 ring-destructive'
                  : isComplete
                  ? 'border-emerald-500 bg-emerald-50/10 ring-1 ring-emerald-500'
                  : 'border-input bg-background focus-within:ring-2 focus-within:ring-ring'
              }`}
            >
              <CardElement
                onChange={handleCardChange}
                options={{
                  style: {
                    base: {
                      fontSize: '14px',
                      color: '#0f172a',
                      fontFamily: 'inherit',
                      '::placeholder': { color: '#94a3b8' },
                    },
                    invalid: { color: '#ef4444' },
                  },
                }}
              />
              {isComplete && !errorMessage && (
                <Check className="absolute right-3 top-3 h-4 w-4 text-emerald-500" />
              )}
            </div>
            {errorMessage && (
              <p className="mt-1.5 text-xs font-medium text-destructive">
                {errorMessage}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={!stripe || isLoading || !isComplete || !isAmountValid}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium h-10 shadow-sm transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Procesando...
              </span>
            ) : (
              'Pagar'
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center text-xs text-muted-foreground gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        Solo para pruebas · Ambiente Sandbox
      </CardFooter>
    </Card>
  );
}