'use client';

import * as React from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { ErrorAlert } from '@/components/shared/error-alert';
import { providerCredentialsClient } from '@/features/provider-credentials/provider-credentials-client';

interface Props {
  children: React.ReactNode;
}

export function StripeElementsProvider({ children }: Props) {
  const [stripe, setStripe] = React.useState<Stripe | null>(null);
  const [loadError, setLoadError] = React.useState<unknown>(null);

  React.useEffect(() => {
    let active = true;
    providerCredentialsClient.getStripeCredentials('sandbox')
      .then((credentials) => {
        if (!credentials.configured || !credentials.publishableKey?.startsWith('pk_test_')) {
          throw new Error('No hay credenciales Stripe sandbox configuradas.');
        }
        return loadStripe(credentials.publishableKey);
      })
      .then((stripeInstance) => {
        if (!stripeInstance) throw new Error('Stripe no devolvió una instancia para la clave sandbox.');
        if (active) setStripe(stripeInstance);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadError !== null) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorAlert
          error={loadError}
          title="No se pudo preparar Stripe Sandbox"
          message="No pudimos cargar las credenciales de prueba para este tenant."
          action="Revisa la conexión y la configuración de Stripe Sandbox e inténtalo nuevamente."
        />
      </div>
    );
  }

  if (!stripe) {
    return <p role="status" className="text-center text-sm text-muted-foreground">Conectando con Stripe Sandbox…</p>;
  }

  return <Elements stripe={stripe}>{children}</Elements>;
}