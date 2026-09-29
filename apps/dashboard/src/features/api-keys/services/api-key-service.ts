import { apiRequest } from "@/lib/api-client";

export type ApiKey = { id: string; tenantId: string; name: string; type: "test" | "live"; keyPrefix: string; maskedKey: string; isActive: boolean; createdAt: string };
export type GeneratedApiKey = ApiKey & { rawKey: string };
const path = (tenantId: string) => `/tenants/${encodeURIComponent(tenantId)}/api-keys`;
export const listApiKeys = (tenantId: string) => apiRequest<ApiKey[]>(path(tenantId), {}, true);
export const generateApiKey = (tenantId: string) => apiRequest<GeneratedApiKey>(path(tenantId), { method: "POST", body: JSON.stringify({ name: "Dashboard Test API Key", type: "test" }) }, true);
export const revokeApiKey = (tenantId: string, keyId: string) => apiRequest<ApiKey>(`${path(tenantId)}/${encodeURIComponent(keyId)}`, { method: "DELETE" }, true);
