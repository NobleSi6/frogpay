'use client';

import * as React from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

interface Props {
  children: React.ReactNode;
}

export function StripeElementsProvider({ children }: Props) {
  return <Elements stripe={stripePromise}>{children}</Elements>;
}