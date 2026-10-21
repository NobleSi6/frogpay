export const FROGPAY_ERROR_CODES = [
  "validation_error",
  "idempotency_in_progress",
  "idempotency_key_reused",
  "deposit_id_reused",
  "plan_limit_exceeded",
  "rate_limit_exceeded",
  "card_declined",
  "insufficient_funds",
  "expired_card",
  "incorrect_cvc",
  "processing_error",
  "provider_timeout",
  "provider_unavailable",
  "qr_expired",
  "transfer_expired",
  "amount_mismatch",
  "currency_mismatch",
  "reference_not_found",
  "invalid_state_transition",
  "unauthorized",
  "forbidden",
  "not_found",
  "internal_error",
  "payment_not_found",
  "simulation_not_allowed",
  "forbidden_in_production",
] as const;

export type FrogPayErrorCode = (typeof FROGPAY_ERROR_CODES)[number];
export type FrogPayErrorContent = { message: string; action: string };

export const UNKNOWN_FROGPAY_ERROR: FrogPayErrorContent = {
  message: "No pudimos completar la operación.",
  action: "Intenta nuevamente. Si el problema continúa, contáctanos al +591 71587251 o a frog@support.com.",
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
  qr_expired: {
    message: "El código QR venció antes de confirmarse.",
    action: "Genera un nuevo pago con QR e inténtalo otra vez.",
  },
  transfer_expired: {
    message: "La transferencia bancaria venció sin recibir el depósito.",
    action: "Crea una nueva transferencia para obtener datos bancarios actualizados.",
  },
  amount_mismatch: {
    message: "El monto del depósito no coincide con el monto del pago.",
    action: "Verifica el monto transferido o crea un pago con el monto correcto.",
  },
  currency_mismatch: {
    message: "La moneda del depósito no coincide con la del pago.",
    action: "Usa la moneda correcta del pago o revisa los datos de la transferencia.",
  },
  reference_not_found: {
    message: "La referencia bancaria no corresponde a ningún pago pendiente.",
    action: "Revisa la referencia del comprobante o el código de la transferencia.",
  },
  deposit_id_reused: {
    message: "El identificador del depósito ya fue utilizado con otros datos.",
    action: "Verifica el comprobante o contacta a soporte si el problema continúa.",
  },
  invalid_state_transition: {
    message: "La operación no es válida para el estado actual del recurso.",
    action: "Actualiza la pantalla y revisa el estado del pago antes de reintentar.",
  },
  rate_limit_exceeded: {
    message: "Superaste el límite de solicitudes por minuto.",
    action: "Espera unos segundos y vuelve a intentarlo.",
  },
  unauthorized: {
    message: "Tu sesión no es válida o venció.",
    action: "Inicia sesión nuevamente para continuar.",
  },
  forbidden: {
    message: "No tienes permisos para realizar esta acción.",
    action: "Solicita acceso al propietario de tu cuenta.",
  },
  not_found: {
    message: "No encontramos el recurso solicitado.",
    action: "Verifica el identificador o vuelve a la lista.",
  },
  internal_error: {
    message: "Ocurrió un error interno en FrogPay.",
    action: "Intenta nuevamente en unos minutos. Si persiste, contáctanos al +591 71587251 o a frog@support.com.",
  },
  payment_not_found: {
    message: "No encontramos el pago solicitado.",
    action: "Verifica el enlace o vuelve a la lista de transacciones.",
  },
  simulation_not_allowed: {
    message: "La simulación no está permitida para este pago.",
    action: "Confirma que el pago esté en un estado simulable e inténtalo de nuevo.",
  },
  forbidden_in_production: {
    message: "Las simulaciones no están disponibles en producción.",
    action: "Cambia al ambiente Sandbox para probar pagos.",
  },
};

export function isFrogPayErrorCode(code: unknown): code is FrogPayErrorCode {
  return typeof code === "string" && FROGPAY_ERROR_CODES.some((item) => item === code);
}

export function getFrogPayError(code: unknown): FrogPayErrorContent {
  return isFrogPayErrorCode(code) ? FROGPAY_ERRORS[code] : UNKNOWN_FROGPAY_ERROR;
}
