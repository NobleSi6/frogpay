import type { PaymentEnvironment } from "./provider-credentials-client";

export type StripeCredentialErrors = { publishableKey?: string; secretKey?: string };

export function validateStripeCredentials(environment: PaymentEnvironment, publishableKey: string, secretKey: string): StripeCredentialErrors {
  const errors: StripeCredentialErrors = {};
  const publicValue = publishableKey.trim();
  const secretValue = secretKey.trim();

  if (!publicValue) errors.publishableKey = "La clave publicable es obligatoria.";
  else if (environment === "sandbox" && !publicValue.startsWith("pk_test_")) errors.publishableKey = "La clave sandbox debe comenzar con pk_test_.";

  if (!secretValue) errors.secretKey = "La clave secreta es obligatoria.";
  else if (environment === "sandbox" && !secretValue.startsWith("sk_test_")) errors.secretKey = "La clave sandbox debe comenzar con sk_test_.";

  return errors;
}
