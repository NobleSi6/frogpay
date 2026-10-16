# ADR-009: Conciliación bancaria automática y simulación del banco

- **Estado:** Aceptado
- **Fecha:** 2026-10-11
- **Decisores:** Laura Pérez (Arquitecto de Software), Jean Fernandez (Backend / Scrum Master)
- **Relacionados:** ADR-001, ADR-002, ADR-003, ADR-008

---

## Contexto

El Sprint 3 incorpora el método de pago por transferencia bancaria (HU-19, HU-20, HU-21). A diferencia de las tarjetas de crédito (flujo síncrono donde la autorización y captura ocurren de inmediato), las transferencias bancarias en Bolivia (SIP / ACH) son **asíncronas y desacopladas**: el cliente genera una intención de pago, recibe instrucciones bancarias con una referencia única, y realiza el depósito desde su entidad financiera.

El sistema debe:
1. Permitir conciliar automáticamente los depósitos recibidos con los pagos pendientes mediante coincidencia estricta de referencia y monto (RF-03, RF-12).
2. Manejar de manera segura discrepancias de monto (`amount_mismatch`), depósitos no identificados (`reference_not_found`) e intentos repetidos de conciliación (idempotencia) (RNF-09).
3. Gestionar el vencimiento de pagos pendientes sin depósito (`transfer_expired`).
4. Proveer un simulador controlado de banco en sandbox para pruebas sin depender de la banca real (RF-03).
5. Mantener el desacoplamiento: el módulo de `payments` no debe depender directamente de implementaciones bancarias concretas (RF-16, RNF-07).

---

## Opciones consideradas

### 1. Conciliación tolerante o parcial vs. Conciliación estricta (1:1)
- **Opción A (Tolerante/Múltiple):** Permitir que múltiples depósitos sumen el total del pago, o tolerar pequeñas diferencias de decimales.
- **Opción B (Estricta 1:1 - Elegida):** Cada pago genera una referencia única exclusiva. La conciliación automática solo aprueba si la referencia existe, el pago está en `pending` y el monto coincide con exactitud de centavos.

### 2. Tratamiento de montos discrepantes
- **Opción A (Aprobar con saldo pendiente):** Dejar el pago en un estado intermedio `partially_paid`.
- **Opción B (Rechazo seguro y auditoría - Elegida):** Si la referencia coincide pero el monto difiere, el pago pasa a `rejected` con código `amount_mismatch`, y el depósito se registra en la tabla `bank_transaction` para revisión manual. Esto previene fraudes o entregas de mercancía con pagos incompletos.

### 3. Registro e Idempotencia de depósitos bancarios
- **Opción A:** Procesar depósitos sin persistir el registro del extracto bancario.
- **Opción B (Doble registro con RLS - Elegida):** Crear la tabla `bank_transaction` con RLS por `tenant_id`. Cada depósito recibido se registra de forma inmutable. Si se recibe un depósito con un identificador bancario ya procesado (`depositId`), se devuelve el resultado previo sin alterar estados ni duplicar eventos en el Outbox.

---

## Decisión

Se adopta la **Conciliación Estricta 1:1 con Registro Inmutable y Tratamiento de Discrepancias**:

1. **Generación de Referencia Única:** `BankTransferLocalAdapter` genera una referencia única (`BT-YYYY-XXXXXX`) con vencimiento configurable (`BANK_TRANSFER_EXPIRATION_HOURS`, por defecto 24 horas).
2. **Máquina de Estados de Conciliación:**
   - **Monto y referencia exactos:** Pago pasa a `approved`. Se calculan comisiones del plan, se actualiza `tenant_plan_usage`, se emite `pago.aprobado` en `domain_event_outbox` y el depósito queda en estado `reconciled`.
   - **Monto distinto:** Pago pasa a `rejected` con `error_code: 'amount_mismatch'`. Se emite `pago.rechazado` en Outbox y el depósito queda en estado `amount_mismatch`.
   - **Referencia inexistente:** El depósito se registra como `unmatched` y ningún pago se altera.
   - **Pago ya no pending:** Se rechaza la operación con `invalid_state_transition`.
3. **Idempotencia:** Los depósitos se identifican de forma unívoca para evitar duplicidad de saldos y eventos.
4. **Vencimiento:** Un worker periódico expira los pagos en `pending` superada su fecha de vigencia (`transfer_expired`).
5. **Simulación:** Endpoint `POST /v1/test/simulators/bank-deposit` disponible exclusivamente en `sandbox` (bloqueado con HTTP 403 en producción).

---

## Consecuencias

### Positivas:
- Prevención total de entregas con montos insuficientes.
- Auditoría completa de cada depósito recibido en la tabla `bank_transaction`.
- Trazabilidad transaccional mediante el patrón Outbox para la emisión de webhooks hacia el comercio.
- Desacoplamiento arquitectónico cumpliendo la regla de dependencias limpias.

### Negativas y Mitigaciones:
- Un cliente que se equivoque al depositar requerirá soporte manual del comercio: mitigado exponiendo el listado de transacciones con filtros en `GET /dashboard/bank-transactions`.

---

## Cumplimiento

1. Pruebas unitarias e integración en verde cubriendo los 4 casos de conciliación.
2. Verificación de que `POST /v1/test/simulators/bank-deposit` retorna `403 Forbidden` en entorno de producción.
3. Verificación de que el módulo `payments` no importa `BankTransferLocalAdapter`.
