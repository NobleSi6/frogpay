# Contrato de la API de Pagos

> TSK-ARQ-302 / TSK-ARQ-307 — Sprint 3.
> Complementa `docs/api/errores.md` y `docs/api/webhooks.md`.

---

## 1. Creación de pago

**Endpoint:** `POST /v1/payments`  
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

Devuelve el estado actual, las instrucciones bancarias (si aplica), la referencia y el historial de transiciones.

### Estados posibles:
- `pending`: Esperando la confirmación o depósito bancario.
- `approved`: Depósito o cobro confirmado exitosamente.
- `rejected`: Rechazado por vencimiento (`transfer_expired`), monto incorrecto (`amount_mismatch`) o rechazo de tarjeta.
- `failed`: Error técnico o indisponibilidad del proveedor.

---

## 3. Simulador de depósito bancario (Ambiente Sandbox)

**Endpoint:** `POST /v1/test/simulators/bank-deposit`  
**Disponibilidad:** Solamente en ambiente `sandbox`. En `production` responde `403 Forbidden`.  
**Autenticación:** API Key del tenant (`X-Api-Key`).

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

3. **La referencia no existe:**
   - El depósito se registra en `bank_transaction` como `unmatched`.
   - No se modifica ningún pago existente.
   - Devuelve código `reference_not_found`.

4. **El depósito ya fue procesado:**
   - Idempotente por `depositId`. No se duplican transiciones ni eventos.

5. **El pago ya no está en `pending`:**
   - Se rechaza la operación con `422 Unprocessable Entity` y código `invalid_state_transition`.

---

## 4. Endpoints del Dashboard BFF

### A. Simular depósito desde el Dashboard
**Endpoint:** `POST /dashboard/payments/:id/simulate-deposit`  
**Autenticación:** Sesión JWT con rol `OWNER` o `ADMIN`.  
**Disponibilidad:** Solo en ambiente `sandbox`.

```json
{
  "mode": "exact"
}
```
*Valores permitidos para `mode`:* `exact`, `amount_mismatch`, `reference_not_found`.

### B. Consulta de depósitos bancarios
**Endpoint:** `GET /dashboard/bank-transactions`  
**Autenticación:** Sesión JWT con rol `OWNER` o `ADMIN`.  
**Filtros (Query params):** `page`, `limit`, `status` (`reconciled`, `amount_mismatch`, `unmatched`), `from`, `to`.

---

## 5. Expiración de transferencias pendientes

Un worker / job periódico inspecciona pagos por transferencia con `status: 'pending'` y `expires_at < NOW()`. Aquellos vencidos pasan a `rejected` con `error_code: 'transfer_expired'` y emiten el evento `pago.rechazado`.
