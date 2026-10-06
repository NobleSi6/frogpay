import { apiRequest } from "@/lib/api-client";

export type PaymentEnvironment = "sandbox" | "production";

export type SaveStripeCredentialsInput = {
  environment: PaymentEnvironment;
  publishableKey: string;
  secretKey: string;
};

export type SavedStripeCredentials = {
  environment: PaymentEnvironment;
  configured: boolean;
  publishableKey: string | null;
  secretKeyMasked: string | null;
};

export interface ProviderCredentialsClient {
  getStripeCredentials(environment: PaymentEnvironment): Promise<SavedStripeCredentials>;
  saveStripeCredentials(input: SaveStripeCredentialsInput): Promise<SavedStripeCredentials>;
}

const credentialsPath = (environment: PaymentEnvironment) =>
  `/tenants/me/providers/stripe/credentials/${environment}`;

class ApiProviderCredentialsClient implements ProviderCredentialsClient {
  getStripeCredentials(environment: PaymentEnvironment) {
    return apiRequest<SavedStripeCredentials>(credentialsPath(environment));
  }

  saveStripeCredentials(input: SaveStripeCredentialsInput) {
    return apiRequest<SavedStripeCredentials>(credentialsPath(input.environment), {
      method: "PUT",
      body: JSON.stringify({
        publishableKey: input.publishableKey,
        secretKey: input.secretKey,
      }),
    });
  }
}

export const providerCredentialsClient: ProviderCredentialsClient = new ApiProviderCredentialsClient();
