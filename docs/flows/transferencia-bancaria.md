# Diagrama de Flujo: Transferencia Bancaria y Conciliación

> TSK-ARQ-306 — Sprint 3 (HU-19, HU-20, HU-21).

Este documento describe el flujo completo de pago mediante transferencia bancaria simulada, desde la creación del pago en el Dashboard/API hasta la recepción del depósito, conciliación automática y notificación vía Webhook.

---

## 1. Diagrama de Secuencia (Flujo Principal y Caminos Alternativos)

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente / Comercio
    participant API as FrogPay API (Payments)
    participant Redis as Redis (Idempotency)
    participant DB as Postgres (Tenant RLS / Outbox)
    participant Adapter as BankTransferLocalAdapter
    participant Sim as Simulador de Banco
    participant Concil as BankReconciliationService
    participant Worker as Outbox Worker / Webhooks
    participant TenantApp as Endpoint Webhook Tenant

    Note over Cliente, API: 1. Creación del Pago por Transferencia
    Cliente->>API: POST /v1/payments (method=bank_transfer, Idempotency-Key)
    API->>Redis: Verificar / Reclamar Idempotency-Key
    alt Clave en progreso (409) o reutilizada con otro body (422)
        API-->>Cliente: Error de idempotencia
    end
    API->>DB: Validar límites del plan tenant
    API->>Adapter: Solicitar instrucciones (monto, moneda)
    Adapter-->>API: Referencia única (BT-2026-X), vencimiento (24h) e instrucciones
    API->>DB: Insertar payment (status=pending, bank_instructions, expires_at)
    API->>DB: Insertar payment_status_history (pending)
    API->>DB: Insertar outbox (pago.creado)
    API->>Redis: Guardar respuesta en caché (TTL 24h)
    API-->>Cliente: 201 Created (status=pending, bankInstructions, reference)

    Note over Sim, Concil: 2. Ingreso del Depósito Bancario (Simulado)
    Cliente->>Sim: POST /v1/test/simulators/bank-deposit (reference, amount, depositId)
    Sim->>Concil: reconcileDeposit(tenantId, reference, amount, depositId)
    Concil->>DB: Verificar si depositId ya existe (Idempotencia)

    alt Depósito ya procesado previamente
        Concil-->>Sim: Retornar resultado existente sin duplicar eventos
    end

    Concil->>DB: Buscar payment por reference (provider_transaction_id)

    alt Camino Alternativo A: Referencia Desconocida
        Concil->>DB: Insertar bank_transaction (status=unmatched)
        Concil-->>Sim: { status: 'unmatched', errorCode: 'reference_not_found' }
    else Camino Alternativo B: Pago no elegible (no sandbox o no transferencia)
        Concil->>DB: Registrar bank_transaction (status=unmatched)
        Concil-->>Sim: { status: 'unmatched', errorCode: 'reference_not_found' }
    else Camino Alternativo C: Pago ya no está en pending (expirado/aprobado)
        Concil->>DB: Insertar bank_transaction (status=unmatched)
        Concil->>DB: Commit de la transacción de auditoría
        Concil-->>Sim: Error 422 invalid_state_transition
    else Camino Alternativo D: Moneda no coincide
        Concil->>DB: Insertar bank_transaction (status=currency_mismatch)
        Concil-->>Sim: { status: 'currency_mismatch', errorCode: 'currency_mismatch' }
    else Camino Alternativo E: Monto No Coincide (amount_mismatch)
        Concil->>DB: Iniciar Transacción
        Concil->>DB: Actualizar payment (status=rejected, error_code=amount_mismatch)
        Concil->>DB: Insertar payment_status_history (rejected, amount_mismatch)
        Concil->>DB: Insertar bank_transaction (status=amount_mismatch)
        Concil->>DB: Insertar outbox (pago.rechazado)
        Concil->>DB: Commit Transacción
        Concil-->>Sim: { status: 'amount_mismatch', errorCode: 'amount_mismatch' }
        Worker->>DB: Consumir outbox (pago.rechazado)
        Worker->>TenantApp: Enviar webhook firmado (HMAC-SHA256)
    else Camino Exitoso: Referencia, moneda y monto coinciden exactamente
        Concil->>DB: Iniciar Transacción
        Concil->>DB: Reclamar transición condicional pending -> approved
        Concil->>DB: Aplicar comisiones solo si una fila cambió
        Concil->>DB: Actualizar tenant_plan_usage (incrementar volumen y tx_count)
        Concil->>DB: Insertar payment_status_history (approved)
        Concil->>DB: Insertar bank_transaction (status=reconciled)
        Concil->>DB: Insertar outbox (pago.aprobado)
        Concil->>DB: Commit Transacción
        Concil-->>Sim: 200 OK { status: 'reconciled', paymentId }
        Worker->>DB: Consumir outbox (pago.aprobado)
        Worker->>TenantApp: Enviar webhook firmado (HMAC-SHA256)
    end

    Note over API, DB: 3. Camino Alternativo D: Vencimiento sin depósito
    loop Job Periódico de Expiración
        API->>DB: SELECT payments WHERE status=pending AND expires_at < NOW()
        API->>DB: UPDATE payment (status=rejected, error_code=transfer_expired)
        API->>DB: INSERT outbox (pago.rechazado, transfer_expired)
        Worker->>TenantApp: Enviar webhook firmado (pago.rechazado)
    end
```

---

## 2. Resumen de Estados del Pago y Transición

| Estado Inicial | Evento / Disparador | Condición | Estado Final | Código de Error | Evento Outbox |
|---|---|---|---|---|---|
| Ninguno | `POST /v1/payments` | Datos válidos, clave idempotente | `pending` | `null` | `pago.creado` |
| `pending` | Depósito bancario | Monto y referencia coinciden | `approved` | `null` | `pago.aprobado` |
| `pending` | Depósito bancario | Referencia coincide, moneda difiere | `pending` | `currency_mismatch` | Ninguno (depósito `currency_mismatch`) |
| `pending` | Depósito bancario | Referencia coincide, monto difiere | `rejected` | `amount_mismatch` | `pago.rechazado` |
| `pending` | Depósito bancario | Referencia desconocida | `pending` (sin cambio) | N/A | Ninguno (depósito `unmatched`) |
| `pending` | Expiración de tiempo | `expires_at < NOW()` | `rejected` | `transfer_expired` | `pago.rechazado` |
| `approved` / `rejected` | Depósito tardío | Pago ya cerrado | Sin cambio | `invalid_state_transition` | Ninguno (depósito `unmatched` auditado) |
