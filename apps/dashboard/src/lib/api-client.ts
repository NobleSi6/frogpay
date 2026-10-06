import { SPRINT1_DEMO_MODE } from "./demo-mode";
import { getSession, setSession } from "@/features/auth/auth-session";

export const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
export const backendIntegrationEnabled = !SPRINT1_DEMO_MODE && apiConfigured;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const configuredBase = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (!configuredBase) throw new ApiError(0, "Falta configurar NEXT_PUBLIC_API_URL.");
  const base = configuredBase.endsWith("/api") ? configuredBase : `${configuredBase}/api`;
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = authenticated ? getSession()?.accessToken : undefined;
  if (token && token !== "demo") headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(15000) });
  } catch { throw new ApiError(0, "No se pudo contactar al servidor. Revisa la conexión y vuelve a intentarlo."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && authenticated) setSession(null);
    const message = data?.message;
    const code = typeof data?.code === "string" ? data.code : undefined;
    throw new ApiError(
      response.status,
      response.status >= 500
        ? "Error del servidor. Inténtalo de nuevo más tarde."
        : Array.isArray(message)
          ? message.join(" ")
          : typeof message === "string"
            ? message
            : "No se pudo completar la solicitud.",
      code,
    );
  }
  return data as T;
}
