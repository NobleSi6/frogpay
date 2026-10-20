import { apiRequest } from "@/lib/api-client";

export type WebhookEnvironment = "sandbox" | "production";
export type WebhookEvent = "pago.creado" | "pago.aprobado" | "pago.rechazado";
export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookEndpoint {
  id: string;
  url: string;
  eventTypes: WebhookEvent[];
  isActive: boolean;
  environment: WebhookEnvironment;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  secret: string;
}

export interface CreateWebhookEndpointInput {
  url: string;
  eventTypes: WebhookEvent[];
  environment: WebhookEnvironment;
}

export type UpdateWebhookEndpointInput = Partial<
  Pick<WebhookEndpoint, "url" | "eventTypes" | "isActive">
>;

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  webhookUrl: string;
  paymentId: string | null;
  eventId: string | null;
  eventType: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  responseCode: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface WebhookDeliveryAttempt {
  attemptNumber: number;
  responseCode: number | null;
  error: string | null;
  durationMs: number;
  succeeded: boolean;
  createdAt: string;
}

export interface WebhookDeliveryDetail extends WebhookDelivery {
  payload: Record<string, unknown>;
  attempts: WebhookDeliveryAttempt[];
}

export interface WebhookDeliveriesResponse {
  data: WebhookDelivery[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WebhookDeliveriesFilters {
  status?: WebhookDeliveryStatus;
  paymentId?: string;
  webhookId?: string;
  page?: number;
  pageSize?: number;
}

export interface WebhookTestResponse {
  deliveryId: string;
  eventType: string;
  status: string;
}

function deliveryQuery(filters: WebhookDeliveriesFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

const endpointPath = "/dashboard/webhooks";
const deliveriesPath = "/dashboard/webhook-deliveries";

export const webhooksService = {
  listEndpoints: () => apiRequest<WebhookEndpoint[]>(endpointPath),

  getEndpoint: (id: string) =>
    apiRequest<WebhookEndpoint>(`${endpointPath}/${encodeURIComponent(id)}`),

  createEndpoint: (input: CreateWebhookEndpointInput) =>
    apiRequest<WebhookEndpointWithSecret>(endpointPath, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateEndpoint: (id: string, input: UpdateWebhookEndpointInput) =>
    apiRequest<WebhookEndpoint>(`${endpointPath}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteEndpoint: (id: string) =>
    apiRequest<void>(`${endpointPath}/${encodeURIComponent(id)}`, { method: "DELETE" }),

  rotateSecret: (id: string) =>
    apiRequest<WebhookEndpointWithSecret>(
      `${endpointPath}/${encodeURIComponent(id)}/rotate-secret`,
      { method: "POST" },
    ),

  sendTest: (id: string) =>
    apiRequest<WebhookTestResponse>(
      `${endpointPath}/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),

  listDeliveries: (filters: WebhookDeliveriesFilters = {}) =>
    apiRequest<WebhookDeliveriesResponse>(`${deliveriesPath}${deliveryQuery(filters)}`),

  getDelivery: (id: string) =>
    apiRequest<WebhookDeliveryDetail>(`${deliveriesPath}/${encodeURIComponent(id)}`),

  retryDelivery: (id: string) =>
    apiRequest<WebhookDelivery>(`${deliveriesPath}/${encodeURIComponent(id)}/retry`, {
      method: "POST",
    }),
};
