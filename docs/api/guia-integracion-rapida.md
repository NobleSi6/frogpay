# Guía de integración rápida

Esta guía describe las rutas implementadas en FrogPay API. La URL local usa
`http://localhost:4000/api`; en otros ambientes sustituye el host y conserva
el prefijo `/api`.

## 1. Crear tenant y obtener una API Key

El alta requiere una sesión administrativa `PLATFORM_ADMIN`. `POST /tenants`
crea el comercio y devuelve las API Keys iniciales sandbox y live en
`apiKeys[].rawKey`. Cada secreto se muestra una sola vez: guárdalo de forma
segura y no lo registres en logs.

```bash
curl -X POST "$FROGPAY_URL/tenants" \
  -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Comercio Express S.R.L.",
    "taxId": "1028472023",
    "contactEmail": "admin@comercioexpress.com",
    "plan": "free"
  }'
```

La respuesta contiene `id`, `owner`, `invitationQueued` y `apiKeys`. El usuario
propietario recibe un correo de invitación. Para activar su cuenta usa el token
recibido por correo:

```bash
curl -X POST "$FROGPAY_URL/identity/activate-invitation" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@comercioexpress.com",
    "token": "<token-recibido-por-correo>",
    "password": "<contraseña-de-al-menos-12-caracteres>"
  }'
```

La ruta implementada es `/identity/activate-invitation`; no hay una ruta
`/v1/tenants/:id/activate`. Para generar una clave adicional se usa
`POST /tenants/:tenantId/api-keys` con sesión de un rol autorizado y un body
`{"name":"Sandbox","type":"test"}`. La llave generada se entrega en `rawKey`
una sola vez.

Selecciona la API Key de tipo `test` para las llamadas sandbox. En cada
solicitud de pagos envíala mediante `X-Api-Key`.

## 2. Crear un pago con tarjeta

Cada intento nuevo requiere un UUID diferente en `Idempotency-Key`. El método
`card` requiere un `paymentToken` de Stripe Elements; no envíes PAN ni CVC.

```bash
curl -X POST "$FROGPAY_URL/v1/payments" \
  -H "X-Api-Key: $FROGPAY_SANDBOX_KEY" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "150.00",
    "currency": "BOB",
    "paymentMethod": "card",
    "merchantReference": "ORDEN-1001",
    "paymentToken": "pm_token_de_stripe"
  }'
```

Una solicitud nueva responde `201 Created`. El resultado del intento se expresa
en `status` (`approved`, `rejected` o `failed`); un rechazo o fallo de pago no
implica un error HTTP. Guarda `id` para consultar el pago.

## 3. Crear un pago por QR

```bash
curl -X POST "$FROGPAY_URL/v1/payments" \
  -H "X-Api-Key: $FROGPAY_SANDBOX_KEY" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440002" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "150.00",
    "currency": "BOB",
    "paymentMethod": "qr",
    "merchantReference": "ORDEN-1002"
  }'
```

La respuesta inicial es `201 Created`, con `status: "pending"` y `qrPayload`.
El pago puede cambiar de estado cuando el proveedor confirma el resultado.

## 4. Crear un pago por transferencia

```bash
curl -X POST "$FROGPAY_URL/v1/payments" \
  -H "X-Api-Key: $FROGPAY_SANDBOX_KEY" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440003" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "150.00",
    "currency": "BOB",
    "paymentMethod": "bank_transfer",
    "merchantReference": "ORDEN-1003"
  }'
```

La respuesta inicial es `201 Created`, con `status: "pending"`,
`bankInstructions` y una referencia bancaria que se usará para conciliar el
depósito.

## 5. Consultar el estado

```bash
curl "$FROGPAY_URL/v1/payments/$PAYMENT_ID" \
  -H "X-Api-Key: $FROGPAY_SANDBOX_KEY"
```

`GET /v1/payments/:id` devuelve `200` si el pago pertenece al tenant de la API
Key. Un ID ajeno o inexistente responde `404` con `payment_not_found`. El body
incluye el estado, los importes, el método, las fechas y el historial; las
instrucciones bancarias y el payload QR se entregan mientras el pago permanece
pendiente.

Si se repite una creación con el mismo tenant, ambiente, `Idempotency-Key` y
cuerpo, FrogPay devuelve la respuesta original con `200 OK`. Reutilizar la
clave con otro cuerpo responde `422` (`idempotency_key_reused`).

## 6. Verificar la firma de webhooks

FrogPay envía webhooks salientes a las URLs registradas en el Dashboard. La
firma HMAC-SHA256 está en `FrogPay-Signature`:

```text
FrogPay-Signature: t=<unix-segundos>,v1=<hex-hmac-sha256>
```

Calcula el HMAC sobre los bytes exactos del body recibido, usando como mensaje
`<timestamp>.<body>` y el secreto `whsec_...` que se devuelve una sola vez al
crear o rotar el endpoint. Rechaza timestamps con más de 300 segundos de
diferencia y compara la firma en tiempo constante. No vuelvas a serializar el
JSON antes de verificarlo.

Ejemplo de verificación en Node.js:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyFrogPaySignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
    .digest();
  const received = Buffer.from(parts.v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

La aplicación expone gestión de endpoints y consulta de entregas bajo
`/dashboard/webhooks` y `/dashboard/webhook-deliveries`. No expone un endpoint
de recepción de webhooks entrantes. Los eventos de pago disponibles incluyen
`pago.creado`, `pago.aprobado` y `pago.rechazado`.

## 7. Catálogo de errores

Los errores HTTP tienen forma `{ "code", "message", "details", "requestId" }`.
Los códigos más relevantes son:

| HTTP | `code` | Significado |
|---:|---|---|
| 400/422 | `validation_error` | Body, ID o `Idempotency-Key` inválido |
| 401 | `missing_api_key`, `invalid_api_key`, `revoked_api_key` | API Key ausente o no válida |
| 404 | `payment_not_found` | Pago inexistente o de otro tenant |
| 409 | `idempotency_in_progress` | La solicitud original sigue en proceso |
| 422 | `idempotency_key_reused` | Se reutilizó la clave con otro cuerpo |
| 429 | `rate_limit_exceeded` | Se excedió el límite de solicitudes |
| 429 | `plan_limit_exceeded` | Se excedió el límite de volumen del plan |
| 403 | `simulation_not_allowed` | Simulador no disponible para ese ambiente |

Los resultados del pago se informan en `status` y `errorCode` dentro de una
respuesta de pago, normalmente `201`: por ejemplo `rejected` +
`card_declined`, o `failed` + `provider_unavailable`. No son errores HTTP.
Consulta el [catálogo completo](./errores.md).

## 8. Consultar log de auditoría

`GET /dashboard/audit-logs` requiere una sesión JWT con rol `OWNER`. Los
parámetros opcionales son `page` (por defecto 1), `limit` (por defecto 25, máximo 100), `paymentId`
(UUID), `action`, `from` y `to` (fechas ISO 8601).
`from` es inclusivo y `to` exclusivo. Los registros se ordenan por fecha
descendente.

```bash
curl "$FROGPAY_URL/dashboard/audit-logs?page=1&limit=25&paymentId=$PAYMENT_ID&action=pago.aprobado&from=2026-10-18T00:00:00.000Z&to=2026-10-20T00:00:00.000Z" \
  -H "Authorization: Bearer $OWNER_JWT"
```

Respuesta `200 OK`:

```json
{
  "data": [
    {
      "eventId": "9e84723b-ec5f-4bb8-a665-000000000001",
      "entity": "payment",
      "entityId": "8a2d8a64-d1ea-4f73-b9fe-64c507ed7391",
      "action": "pago.aprobado",
      "previousState": { "status": "pending" },
      "newState": { "status": "approved" },
      "actor": { "type": "system" },
      "requestId": "req_audit_123",
      "environment": "sandbox",
      "createdAt": "2026-10-19T12:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 25,
  "total": 1,
  "totalPages": 1
}
```

Una sesión ausente responde `401`; un rol distinto de `OWNER` responde `403`.

## 9. Consultar métricas del Dashboard

`GET /dashboard/metrics` requiere JWT y `days` (`7` o `30`) y `environment`
(`sandbox` o `production`) son obligatorios. La implementación admite los roles
`OWNER`, `OPERATOR` y `VIEWER`. La respuesta se cachea durante 5 minutos.

```bash
curl "$FROGPAY_URL/dashboard/metrics?days=7&environment=sandbox" \
  -H "Authorization: Bearer $OWNER_JWT"
```

La respuesta incluye `from`, `to`, `environment`, `currency`, `volume`,
`transactionCount`, `approvalRate`, `commissionAmount`, `netAmount`,
`byMethod`, `dailySeries` y `generatedAt`. `dailySeries` contiene exactamente
un elemento por día solicitado, incluyendo días sin actividad:

```json
{
  "from": "2026-10-13",
  "to": "2026-10-19",
  "environment": "sandbox",
  "currency": "BOB",
  "volume": "150.00",
  "transactionCount": 2,
  "approvalRate": 0.5,
  "commissionAmount": "5.25",
  "netAmount": "144.75",
  "byMethod": [
    { "paymentMethod": "card", "transactionCount": 2, "approvedCount": 1, "volume": "150.00" }
  ],
  "dailySeries": [
    { "date": "2026-10-13", "transactionCount": 0, "volume": "0.00", "approvedCount": 0, "rejectedCount": 0, "failedCount": 0, "pendingCount": 0, "approvalRate": 0 },
    { "date": "2026-10-14", "transactionCount": 0, "volume": "0.00", "approvedCount": 0, "rejectedCount": 0, "failedCount": 0, "pendingCount": 0, "approvalRate": 0 },
    { "date": "2026-10-15", "transactionCount": 0, "volume": "0.00", "approvedCount": 0, "rejectedCount": 0, "failedCount": 0, "pendingCount": 0, "approvalRate": 0 },
    { "date": "2026-10-16", "transactionCount": 0, "volume": "0.00", "approvedCount": 0, "rejectedCount": 0, "failedCount": 0, "pendingCount": 0, "approvalRate": 0 },
    { "date": "2026-10-17", "transactionCount": 0, "volume": "0.00", "approvedCount": 0, "rejectedCount": 0, "failedCount": 0, "pendingCount": 0, "approvalRate": 0 },
    { "date": "2026-10-18", "transactionCount": 1, "volume": "0.00", "approvedCount": 0, "rejectedCount": 0, "failedCount": 0, "pendingCount": 1, "approvalRate": 0 },
    { "date": "2026-10-19", "transactionCount": 1, "volume": "150.00", "approvedCount": 1, "rejectedCount": 0, "failedCount": 0, "pendingCount": 0, "approvalRate": 1 }
  ],
  "generatedAt": "2026-10-19T12:00:00.000Z"
}
```

`volume`, `commissionAmount` y `netAmount` suman solo pagos exitosos
(`approved`, `refunded`, `partially_refunded`). `transactionCount` cuenta todos
los pagos del intervalo. `approvalRate` es éxitos dividido entre resultados
terminales. `byMethod` agrupa por método; `dailySeries` agrega los contadores e
importes por fecha UTC. Las tasas son números de 0 a 1 y los montos son cadenas
decimales. Una sesión ausente responde `401`; rol no permitido responde `403`.

## 10. Consultar estado de la plataforma

`GET /admin/platform-status` es una ruta administrativa que actualmente
requiere rol `PLATFORM_ADMIN`.

```bash
curl "$FROGPAY_URL/admin/platform-status" \
  -H "Authorization: Bearer $PLATFORM_ADMIN_JWT"
```

Ejemplo de respuesta:

```json
{
  "status": "ok",
  "timestamp": "2026-10-19T12:00:00.000Z",
  "services": {
    "api": { "status": "up", "uptime": 120 },
    "database": { "status": "up", "type": "postgresql", "latencyMs": 2 },
    "eventBus": { "status": "up", "provider": "rabbitmq" },
    "redis": { "status": "up" }
  },
  "circuitBreakers": [{ "provider": "stripe", "state": "closed", "failures": 0 }],
  "outbox": { "pending": 0 }
}
```

La implementación actual devuelve `status: "ok"` o `"degraded"`, `timestamp`,
`services`, `circuitBreakers` y `outbox.pending`. No devuelve todavía
`dependencies`, `providerCircuits`, `deadLetterQueues` ni
`webhookDeliveries`; `PLATFORM_OBSERVER` tampoco está habilitado por el
controlador actual. Sin sesión responde `401`; un rol distinto de
`PLATFORM_ADMIN` responde `403`.

## 11. Simuladores sandbox

Usa siempre una API Key `test`. Estos endpoints no son para producción:

- `POST /v1/test/simulators/bank-deposit`: concilia una transferencia con
  `depositId`, `reference`, `amount`, `currency` y `bankName`. Una coincidencia
  exacta aprueba el pago.
- `POST /v1/test/simulators/provider-fault`: recibe `provider` (`stripe`, si
  está habilitado), `mode` (`error` o `latency`) y `durationSeconds`. Para
  `latency` se puede indicar `latencyMs`.
- `GET` y `DELETE /v1/test/simulators/provider-fault`: inspecciona y limpia
  fallas simuladas.
- `POST /v1/test/simulators/qr-callback`: simula el callback de un pago QR con
  `payment_id` y `result`.

En producción, los simuladores responden `403 Forbidden`.
