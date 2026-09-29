import { SPRINT1_DEMO_MODE } from "./demo-mode";

export const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
export const backendIntegrationEnabled = !SPRINT1_DEMO_MODE && apiConfigured;
// Temporary backend testing contract. Never enabled in production builds.
export const developmentIntegration = apiConfigured && process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_DEV_MODE === "true";
export const developmentTenantId = developmentIntegration ? process.env.NEXT_PUBLIC_API_DEV_TENANT_ID?.trim() : undefined;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, developmentRole = false): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (!base) throw new ApiError(0, "Falta configurar NEXT_PUBLIC_API_URL.");
  if (developmentRole && !developmentIntegration) throw new ApiError(403, "La autenticación real todavía no está disponible.");
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (developmentRole) headers.set("x-user-role", "PLATFORM_ADMIN");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(15000) });
  } catch { throw new ApiError(0, "No se pudo contactar al servidor. Revisa la conexión y vuelve a intentarlo."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message;
    throw new ApiError(response.status, response.status >= 500 ? "Error del servidor. Inténtalo de nuevo más tarde." : Array.isArray(message) ? message.join(" ") : typeof message === "string" ? message : "No se pudo completar la solicitud.");
  }
  return data as T;
}
