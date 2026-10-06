# Catálogo de errores

> TSK-ARQ-204 — Sprint 2. Complementa `docs/api/pagos.md`.

## Distinción central: errores de solicitud vs. resultados de pago

El catálogo tiene 11 códigos, pero **no todos significan lo mismo**:

- **Errores de solicitud** (4 códigos): la API rechaza la petición antes
  de — o en vez de — procesar un pago. Usan el formato de error estándar
  `{ code, message, details, requestId }` y un código HTTP de error
  (4xx/5xx). El filtro global de excepciones los produce.
- **Resultados de pago** (7 códigos): la solicitud se procesó
  correctamente — la API responde `201 Created` igual que un pago
  aprobado — pero el *pago en sí* quedó en `rejected` o `failed`, y el
  código va en `payment.errorCode`, dentro del body normal. **Esto NO es
  un error HTTP.**

Confundir estas dos categorías rompe la idempotencia ya acordada: un pago
rechazado reintentado con la misma `Idempotency-Key` debe devolver `200`
con la misma respuesta cacheada — si `card_declined` disparara una
excepción HTTP, ese contrato se rompe.

## Errores de solicitud

| Código | HTTP | Cuándo ocurre |
|---|---|---|
| `validation_error` | 422 | Campos faltantes o con formato inválido en el body (antes de siquiera consultar idempotencia). |
| `idempotency_in_progress` | 409 | Misma `Idempotency-Key`, solicitud original aún en `PROCESSING`. |
| `idempotency_key_reused` | 422 | Misma `Idempotency-Key`, cuerpo con hash distinto. |
| `plan_limit_exceeded` | 429 | El tenant superó el límite de volumen de su plan (RF-20). |

Forma de la respuesta, igual para los 4:

```json
{
  "code": "plan_limit_exceeded",
  "message": "Superaste el límite de volumen mensual de tu plan.",
  "details": { "limit": "5000.00", "used": "5120.00" },
  "requestId": "req_8a1c..."
}
```

`details` es específico de cada código y puede ser `null`.

## Resultados de pago

Van en `payment.errorCode` cuando `payment.status` es `rejected` o
`failed`. La respuesta HTTP sigue siendo `201 Created`.

| Código | `payment.status` | Origen |
|---|---|---|
| `card_declined` | `rejected` | Rechazo genérico de Stripe sin motivo más específico (`generic_decline`). |
| `insufficient_funds` | `rejected` | Rechazo de Stripe por fondos insuficientes. |
| `expired_card` | `rejected` | Rechazo de Stripe por tarjeta vencida. |
| `incorrect_cvc` | `rejected` | Rechazo de Stripe por CVC incorrecto. |
| `processing_error` | `rejected` | Error genérico del lado de Stripe al procesar (no es rechazo del banco). |
| `provider_timeout` | `failed` | El adapter no obtuvo respuesta de Stripe dentro de los 3000 ms (`ProviderResult.outcome === 'timeout'`). |
| `provider_unavailable` | `failed` | Falla de conexión con Stripe, sin respuesta alguna (`ProviderResult.outcome === 'error'`). |

El adapter asigna `provider_timeout` a los timeouts y
`provider_unavailable` a los errores de infraestructura. Los estados de
PaymentIntent no esperados con confirmación automática se normalizan a
`processing_error`. Los códigos internos de Stripe se conservan únicamente
en los logs del adapter y no salen en `ProviderResult`.

## Status HTTP de los resultados de pago — aclaración

`card_declined`, `insufficient_funds`, etc. **no tienen un "código HTTP"
propio** — viven dentro de un `201 Created`. La tabla de arriba lista
`payment.status`, no un código HTTP, a propósito.

## Mensajes para la interfaz (TSK-DEV2-203)

Los mensajes definidos en el catálogo de código son valores por defecto de
la API. La interfaz puede usar un mapa propio por código para presentar
mensajes y acciones adecuados a cada flujo; esos textos no se duplican aquí.
