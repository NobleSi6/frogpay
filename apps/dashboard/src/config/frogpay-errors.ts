export const FROGPAY_ERROR_CODES = [
  "card_declined",
  "insufficient_funds",
  "expired_card",
  "incorrect_cvc",
  "processing_error",
  "provider_timeout",
  "provider_unavailable",
  "idempotency_in_progress",
  "idempotency_key_reused",
  "plan_limit_exceeded",
  "validation_error",
] as const;

export type FrogPayErrorCode = (typeof FROGPAY_ERROR_CODES)[number];
export type FrogPayErrorContent = { message: string; action: string };

export const UNKNOWN_FROGPAY_ERROR: FrogPayErrorContent = {
  message: "No pudimos completar la operación.",
  action: "Intenta nuevamente. Si el problema continúa, contacta a soporte.",
};

export const FROGPAY_ERRORS: Record<FrogPayErrorCode, FrogPayErrorContent> = {
  card_declined: {
    message: "Tu tarjeta fue rechazada por el banco.",
    action: "Prueba con otra tarjeta o contacta a tu banco.",
  },
  insufficient_funds: {
    message: "La tarjeta no tiene fondos suficientes.",
    action: "Usa otro medio de pago o verifica el saldo disponible.",
  },
  expired_card: {
    message: "La tarjeta está vencida.",
    action: "Actualiza la fecha de vencimiento o usa otra tarjeta.",
  },
  incorrect_cvc: {
    message: "El código de seguridad de la tarjeta es incorrecto.",
    action: "Revisa el CVC e intenta nuevamente.",
  },
  processing_error: {
    message: "No pudimos procesar el pago.",
    action: "Espera unos minutos e intenta nuevamente.",
  },
  provider_timeout: {
    message: "El proveedor tardó demasiado en responder.",
    action: "Intenta nuevamente en unos minutos.",
  },
  provider_unavailable: {
    message: "El proveedor de pagos no está disponible en este momento.",
    action: "Espera unos minutos o utiliza otro proveedor habilitado.",
  },
  idempotency_in_progress: {
    message: "Esta operación todavía se está procesando.",
    action: "Espera el resultado antes de volver a intentarlo.",
  },
  idempotency_key_reused: {
    message: "Esta solicitud ya fue utilizada con datos diferentes.",
    action: "Genera una nueva clave de idempotencia para la operación.",
  },
  plan_limit_exceeded: {
    message: "Alcanzaste el límite disponible de tu plan.",
    action: "Revisa tu consumo o actualiza el plan de FrogPay.",
  },
  validation_error: {
    message: "Hay datos que necesitan corrección.",
    action: "Revisa los campos marcados e intenta nuevamente.",
  },
};

export function isFrogPayErrorCode(code: unknown): code is FrogPayErrorCode {
  return typeof code === "string" && FROGPAY_ERROR_CODES.some((item) => item === code);
}

export function getFrogPayError(code: unknown): FrogPayErrorContent {
  return isFrogPayErrorCode(code) ? FROGPAY_ERRORS[code] : UNKNOWN_FROGPAY_ERROR;
}
