# Contrato de la API de Pagos

> TSK-ARQ-302 / TSK-ARQ-307 — Sprint 3.
> Complementa `docs/api/errores.md` y `docs/api/webhooks.md`.

---

## 1. Creación de pago

**Endpoint:** `POST /v1/payments`<br>
**Autenticación:** API Key del tenant mediante cabecera `X-Api-Key`.
**Cabecera obligatoria:** `Idempotency-Key: <UUID>`

La clave de idempotencia garantiza que reintentos de una misma solicitud no creen pagos duplicados.

### A. Método: Transferencia Bancaria (`bank_transfer`)

El método `bank_transfer` no requiere token de tarjeta ni credenciales bancarias del cliente.

#### Cuerpo de la solicitud
```json
{
  "amount": "150.00",
  "currency": "BOB",
  "paymentMethod": "bank_transfer",
  "merchantReference": "ORDEN-1001"
}
```

#### Respuesta exitosa (201 Created)
```json
{
  "id": "8a2d8a64-d1ea-4f73-b9fe-64c507ed7391",
  "status": "pending",
  "amount": "150.00",
  "currency": "BOB",
  "paymentMethod": "bank_transfer",
  "environment": "sandbox",
  "merchantReference": "ORDEN-1001",
  "commissionAmount": null,
  "netAmount": null,
  "providerTransactionId": "BT-2026-A81F92",
  "errorCode": null,
  "expiresAt": "2026-10-12T20:00:00.000Z",
  "bankInstructions": {
    "bankName": "Banco FrogPay Simulado",
    "accountNumber": "10000012345",
    "accountHolder": "FrogPay Bolivia",
    "amount": "150.00",
    "currency": "BOB",
    "reference": "BT-2026-A81F92"
  },
  "createdAt": "2026-10-11T20:00:00.000Z",
  "updatedAt": "2026-10-11T20:00:00.000Z"
}
```

- El pago permanece en estado `pending` hasta que se concilie un depósito bancario o hasta que venza (`expiresAt`).
- Si se repite la misma solicitud con la misma `Idempotency-Key`, la API devuelve `200 OK` con la misma respuesta en caché sin duplicar el pago.
- Si la clave se reutiliza con un cuerpo diferente, devuelve `422 Unprocessable Entity` con código `idempotency_key_reused`.

---

## 2. Consulta del estado del pago

**Endpoint:** `GET /v1/payments/:id`
**Autenticación:** API Key del tenant (`X-Api-Key`).

La URL local completa incluye el prefijo global `/api`: `GET /api/v1/payments/:id`.
El tenant y el ambiente se derivan de la API Key; no se aceptan como parámetros.
Un pago inexistente o perteneciente a otro tenant responde `404` para no revelar
su existencia.

### Respuesta `200 OK`

Devuelve el contrato de `PaymentDetailsResponseDto`: todos los campos de la
respuesta de creación más el historial de transiciones, en orden cronológico
(antiguas primero). `expiresAt`, `bankInstructions` y `qrPayload` son `null` o
se omiten cuando no aplican; los datos de QR o de transferencia solo se
devuelven mientras el pago esté pendiente.

```json
{
  "id": "8a2d8a64-d1ea-4f73-b9fe-64c507ed7391",
  "status": "pending",
  "amount": "150.00",
  "currency": "BOB",
  "paymentMethod": "bank_transfer",
  "environment": "sandbox",
  "merchantReference": "ORDEN-1001",
  "commissionAmount": null,
  "netAmount": null,
  "providerTransactionId": "BT-2026-A81F92",
  "errorCode": null,
  "expiresAt": "2026-10-12T20:00:00.000Z",
  "bankInstructions": {
    "bankName": "Banco FrogPay Simulado",
    "accountNumber": "10000012345",
    "accountHolder": "FrogPay Bolivia",
    "amount": "150.00",
    "currency": "BOB",
    "reference": "BT-2026-A81F92"
  },
  "qrPayload": null,
  "createdAt": "2026-10-11T19:00:00.000Z",
  "updatedAt": "2026-10-11T19:00:00.000Z",
  "statusHistory": [
    {
      "previousStatus": null,
      "newStatus": "pending",
      "metadata": {},
      "createdAt": "2026-10-11T19:00:00.000Z"
    }
  ]
}
```

`amount`, `commissionAmount` y `netAmount` son cadenas decimales; las fechas
son ISO 8601 en UTC. `metadata` no debe contener PAN, CVC, credenciales ni
secretos del proveedor.

| HTTP | Código | Condición |
|---|---|---|
| `200` | — | Pago visible para el tenant de la API Key. |
| `400` | `validation_error` | `id` no es un UUID válido. |
| `401` | `missing_api_key` / `invalid_api_key` | API Key ausente, inválida o revocada. |
| `404` | — | Pago inexistente o de otro tenant. |

El detalle del Dashboard puede añadir `webhookDeliveries`; ese campo pertenece
al contrato BFF de [dashboard.md](dashboard.md), no a este endpoint público.

### Estados posibles:
- `pending`: esperando confirmación, depósito o vencimiento.
- `approved`: cobro o depósito confirmado.
- `rejected`: rechazo del proveedor o regla de negocio; consultar `errorCode`.
- `failed`: error técnico o indisponibilidad del proveedor.
- `expired`, `refunded` y `partially_refunded`: estados admitidos por el modelo
  de persistencia; los endpoints de reembolso y expiración deben documentar
  cuándo se habiliten para cada método.

---

## 3. Simulador de depósito bancario (Ambiente Sandbox)

**Endpoint:** `POST /v1/test/simulators/bank-deposit`<br>
**Disponibilidad:** Solamente en ambiente `sandbox`. En `production` responde `403 Forbidden`.
**Autenticación:** API Key del tenant (`X-Api-Key`).
**Respuesta de conciliación:** `200 OK`.

### Cuerpo de la solicitud
```json
{
  "depositId": "DEP-2026-991823",
  "reference": "BT-2026-A81F92",
  "amount": "150.00",
  "currency": "BOB",
  "bankName": "Banco de Prueba"
}
```

### Reglas de conciliación automática:

1. **Referencia y monto coinciden exactamente:**
   - El pago pasa de `pending` a `approved`.
   - Se calculan comisión y monto neto según el plan del tenant.
   - Se actualiza el consumo en `tenant_plan_usage`.
   - Se registra en `payment_status_history`.
   - El depósito se registra en `bank_transaction` como `reconciled`.
   - Se publica el evento `pago.aprobado` en Outbox y se dispara el webhook correspondiente.

2. **La referencia existe, pero el monto es diferente:**
   - El pago pasa de `pending` a `rejected` con código `amount_mismatch`.
   - El depósito se registra en `bank_transaction` con estado `amount_mismatch` para revisión.
   - Se registra en `payment_status_history`.
   - Se publica el evento `pago.rechazado` en Outbox.

3. **La moneda del depósito no coincide con la del pago:**
   - El pago permanece `pending`; no se aprueba ni se rechaza.
   - El depósito se registra como `currency_mismatch` para revisión.
   - Devuelve código `currency_mismatch`.

4. **La referencia no existe o no corresponde a un pago sandbox por transferencia:**
   - El depósito se registra en `bank_transaction` como `unmatched`.
   - No se modifica ningún pago existente.
   - Devuelve código `reference_not_found`.

5. **El depósito ya fue procesado:**
   - Idempotente por `(tenantId, depositId)`. No se duplican transiciones ni eventos.
   - Reutilizar el identificador con otros datos responde `409 Conflict`.

6. **El pago ya no está en `pending`, o cambió de estado durante la conciliación:**
   - El depósito se registra como `unmatched` y la operación responde
     `422 Unprocessable Entity` con código `invalid_state_transition`.

---

## 4. Endpoints del Dashboard BFF

### A. Simular depósito desde el Dashboard
**Endpoint:** `POST /dashboard/payments/:id/simulate-deposit`<br>
**Autenticación:** Sesión JWT con rol `OWNER` o `ADMIN`.
**Disponibilidad:** Solo en ambiente `sandbox`.

```json
{
  "mode": "exact"
}
```
*Valores permitidos para `mode`:* `exact`, `amount_mismatch`, `reference_not_found`.
La simulación solo admite pagos sandbox cuyo método sea `bank_transfer`.
La API de depósitos valida `currency: "BOB"`; monedas no soportadas se rechazan
con `400` antes de conciliar.

### B. Consulta de depósitos bancarios
**Endpoint:** `GET /dashboard/bank-transactions`<br>
**Autenticación:** Sesión JWT con rol `OWNER` o `ADMIN`.
**Filtros (Query params):** `page`, `limit`, `status` (`reconciled`,
`amount_mismatch`, `currency_mismatch`, `unmatched`, `reference_not_found`),
`from`, `to`.

---

## 5. Expiración de transferencias pendientes

Un worker / job periódico inspecciona pagos por transferencia con `status: 'pending'` y `expires_at < NOW()`. Aquellos vencidos pasan a `rejected` con `error_code: 'transfer_expired'` y emiten el evento `pago.rechazado`.
