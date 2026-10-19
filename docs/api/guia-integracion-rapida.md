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

Las rutas `/dashboard/metrics` y `/dashboard/audit-logs` no están implementadas
en esta versión y no forman parte del contrato OpenAPI publicado.

## 8. Simuladores sandbox

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
