export type PaymentEnvironment = "sandbox" | "production";

export type SaveStripeCredentialsInput = {
  tenantId: string;
  environment: PaymentEnvironment;
  publishableKey: string;
  secretKey: string;
};

export type SavedStripeCredentials = {
  environment: PaymentEnvironment;
  publishableKey: string;
  maskedSecret: string;
};

export const PROVIDER_CREDENTIALS_INTEGRATION = {
  status: "pending-backend-contract",
  detail: "El backend actual no expone un contrato HTTP para credenciales de proveedores.",
} as const;

export const MASKED_PROVIDER_SECRET = "••••••••••••••••";

export interface ProviderCredentialsClient {
  saveStripeCredentials(input: SaveStripeCredentialsInput): Promise<SavedStripeCredentials>;
}

class LocalPendingContractClient implements ProviderCredentialsClient {
  async saveStripeCredentials(input: SaveStripeCredentialsInput): Promise<SavedStripeCredentials> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      environment: input.environment,
      publishableKey: input.publishableKey,
      maskedSecret: MASKED_PROVIDER_SECRET,
    };
  }
}

// Sustituir este adaptador cuando Dev 3 publique el contrato real. No se ha inventado ninguna ruta HTTP.
export const providerCredentialsClient: ProviderCredentialsClient = new LocalPendingContractClient();
