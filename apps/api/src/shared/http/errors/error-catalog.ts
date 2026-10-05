export const ERROR_CATALOG = {
  validation_error: {
    code: 'validation_error',
    httpStatus: 422,
    message: 'La solicitud contiene datos inválidos.',
  },
  idempotency_in_progress: {
    code: 'idempotency_in_progress',
    httpStatus: 409,
    message: 'Ya existe una solicitud en proceso para esta clave de idempotencia.',
  },
  idempotency_key_reused: {
    code: 'idempotency_key_reused',
    httpStatus: 422,
    message: 'La clave de idempotencia ya fue utilizada con una solicitud diferente.',
  },
  plan_limit_exceeded: {
    code: 'plan_limit_exceeded',
    httpStatus: 429,
    message: 'Superaste el límite de volumen mensual de tu plan.',
  },
  card_declined: {
    code: 'card_declined',
    message: 'El emisor rechazó el método de pago.',
  },
  insufficient_funds: {
    code: 'insufficient_funds',
    message: 'El método de pago no tiene fondos suficientes.',
  },
  expired_card: {
    code: 'expired_card',
    message: 'La tarjeta está vencida.',
  },
  incorrect_cvc: {
    code: 'incorrect_cvc',
    message: 'El código de seguridad de la tarjeta es incorrecto.',
  },
  processing_error: {
    code: 'processing_error',
    message: 'Ocurrió un error al procesar el pago.',
  },
  provider_timeout: {
    code: 'provider_timeout',
    message: 'El proveedor de pagos no respondió a tiempo.',
  },
  provider_unavailable: {
    code: 'provider_unavailable',
    message: 'El proveedor de pagos no está disponible.',
  },
} as const;

export type ErrorCatalogCode = keyof typeof ERROR_CATALOG;
