# Pruebas manuales: transferencia y conciliación bancaria

Guía para ejecutar pruebas manuales del flujo bancario de FrogPay en un entorno
local conectado exclusivamente a una base de datos sandbox. No apuntes estos
pasos a producción: crean pagos y transacciones bancarias persistentes.

## Preparación

1. Configura API, PostgreSQL, Redis y RabbitMQ con credenciales de desarrollo y
   una base de datos de pruebas aislada.
2. Inicia los servicios con el procedimiento habitual del repositorio y
   comprueba `GET http://localhost:4000/health`. La API, la base de datos y el
   event bus deben figurar como disponibles.
3. Abre Swagger en <http://localhost:4000/api/docs>.
4. Ten disponible:
   - Una API key `test` del tenant.
   - Un JWT válido de `OWNER` o `ADMIN` para el mismo tenant, para los endpoints
     del Dashboard.
   - El catálogo `bank_transfer` y el proveedor activo
     `bank_transfer_local`.

No copies credenciales en capturas, logs, documentación ni commits. Si el
catálogo falta, prepara o restaura los datos iniciales en la base sandbox antes
de comenzar; no ejecutes seeds ni migraciones contra producción.

## 1. Crear un pago bancario pendiente

En Swagger ejecuta `POST /api/v1/payments` con la API key sandbox en
`X-Api-Key` y un UUID nuevo en `Idempotency-Key`.

```json
{
  "amount": "150.00",
  "currency": "BOB",
  "paymentMethod": "bank_transfer",
  "merchantReference": "manual-qa-001"
}
```

Resultado esperado: `201 Created`, estado `pending`, ambiente `sandbox` y
`bankInstructions` con una referencia bancaria. Guarda el `id` del pago y la
referencia para los pasos siguientes. No reutilices el UUID de idempotencia con
un cuerpo diferente.

## 2. Conciliación exacta desde el Dashboard

Con el JWT del mismo tenant, ejecuta
`POST /api/dashboard/payments/{paymentId}/simulate-deposit`:

```json
{
  "mode": "exact"
}
```

Resultado esperado: `200 OK`, `status: "reconciled"` y el `paymentId`
correspondiente. El pago debe pasar a `approved`. Este modo simula un depósito
por el monto y la referencia correctos.

Verifica el resultado con:

- `GET /api/dashboard/payments/{paymentId}`: el estado debe ser `approved` y
  el historial debe reflejar la transición desde `pending`.
- `GET /api/dashboard/bank-transactions`: debe aparecer una transacción con
  estado `reconciled` y el `paymentId` asociado.

## 3. Probar una discrepancia de monto

**Crea otro pago pendiente.** La discrepancia rechaza el pago y no es posible
reutilizar ese pago para probar luego una conciliación exacta.

Envía a `POST /api/dashboard/payments/{paymentId}/simulate-deposit`:

```json
{
  "mode": "amount_mismatch"
}
```

Resultado esperado: `200 OK` y `status: "amount_mismatch"`. El pago pasa a
`rejected` con `errorCode: "amount_mismatch"` y la transacción bancaria queda
registrada para revisión.

## 4. Probar una referencia inexistente

Crea un tercer pago pendiente y simula:

```json
{
  "mode": "reference_not_found"
}
```

Resultado esperado: `200 OK`, `status: "unmatched"` y
`errorCode: "reference_not_found"`. El pago original permanece `pending`; el
depósito se registra sin asociarlo a un pago. En el listado se guarda con
estado `unmatched`. El filtro `status=reference_not_found` del listado también
consulta estos registros `unmatched`.

## 5. Probar la recepción directa de un depósito simulado

Este endpoint prueba el contrato del simulador que recibe una referencia,
monto y datos bancarios explícitos. Usa un pago pendiente recién creado y su
referencia real:

`POST /api/v1/test/simulators/bank-deposit`

Headers: `X-Api-Key` con la API key `test` del tenant.

```json
{
  "reference": "BT-REFERENCIA-DEVUELTA-POR-EL-PAGO",
  "amount": "150.00",
  "currency": "BOB",
  "bankName": "Banco de Prueba Manual",
  "depositId": "manual-deposit-qa-001"
}
```

Resultado esperado para coincidencia exacta: `200 OK` con estado
`reconciled` y `paymentId`. Si
repites la llamada con el mismo `depositId`, debe devolverse el resultado
registrado sin crear una segunda transacción ni duplicar la conciliación. El
endpoint está limitado a API keys de sandbox; con una llave de producción debe
responder `403 Forbidden`.

## Errores y comprobaciones adicionales

- `400`: cuerpo incompleto o inválido, UUID de pago inválido u otro error de
  validación.
- `403`: intento de simulación fuera de sandbox.
- `404`: pago inexistente o que no pertenece al tenant autenticado.
- `422 invalid_state_transition`: se intenta conciliar una referencia cuyo
  pago ya no está `pending`.
- Si se repite `depositId` con otra referencia, monto o moneda, espera
  `409 Conflict` con `deposit_id_reused`.
- El simulador solo acepta `currency: "BOB"` actualmente. Por eso el caso
  `currency_mismatch` se cubre con pruebas automatizadas para pagos históricos
  o monedas adicionales; no se puede generar mediante el flujo HTTP vigente.
- Las pruebas con `amount_mismatch`, `currency_mismatch` y
  `reference_not_found` crean registros persistentes. Usa identificadores
  únicos y una base aislada.
- No borres datos directamente de la base compartida como parte de la prueba.

## Limpieza y evidencia

Al terminar, revoca cualquier API key temporal creada para la prueba. Los pagos
y transacciones de sandbox son datos de auditoría y pueden permanecer en la
base aislada. Registra en el resultado de QA: ambiente, tenant de prueba (sin
secretos), fecha, endpoint, escenario, código HTTP, estado final del pago,
estado de la transacción y cualquier `errorCode`.
