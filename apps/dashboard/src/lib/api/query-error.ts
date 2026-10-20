import { ApiError } from "@/lib/api-client";

export const RATE_LIMIT_MESSAGE =
  "Superaste el límite de solicitudes (rate_limit_exceeded). Espera unos segundos y vuelve a intentarlo.";

export function isRateLimitError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 429 || error.code === "rate_limit_exceeded")
  );
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function isValidationError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 400 || error.code === "validation_error");
}

/** Mensaje en español apropiado para el error de una consulta de dashboard. */
export function describeQueryError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (isRateLimitError(error)) return RATE_LIMIT_MESSAGE;
    if (error.status === 0) return error.message;
    if (error.status === 401) return "Tu sesión expiró o no es válida. Inicia sesión de nuevo.";
    if (error.status === 403) return "No tienes permiso para consultar estos datos.";
    if (isValidationError(error)) {
      const detail = Array.isArray(error.details)
        ? error.details.join(" ")
        : typeof error.message === "string" && error.message
          ? error.message
          : "";
      return detail ? `Filtros inválidos: ${detail}` : "Los filtros de la solicitud no son válidos.";
    }
    if (typeof error.message === "string" && error.message) return error.message;
  }
  return fallback;
}
