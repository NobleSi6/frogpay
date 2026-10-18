# Diagrama de Flujo: Auditoría Inmutable y Observabilidad

> TSK-ARQ-401 — Nota de los sprints / HU-10 / HU-15.

Este documento describe el cambio de estado de un pago, la persistencia y
publicación del evento mediante Outbox y RabbitMQ, su registro idempotente en
la cadena de auditoría, la entrega del webhook y la observabilidad del flujo.

---

## 1. Diagrama de Secuencia (Flujo Principal y Caminos Alternativos)

```mermaid
sequenceDiagram
    autonumber
    actor Comercio
    participant API as API FrogPay
    participant DB as PostgreSQL
    participant Outbox as Worker Outbox
    participant MQ as RabbitMQ
    participant Audit as Consumidor de Auditoría
    participant Webhook as Worker Webhooks
    participant Prom as Prometheus / Grafana
    actor Admin as Administrador
    actor Operador as Operador no autorizado

    Note over Comercio, DB: 1. Cambio de estado y publicación del evento
    Comercio->>API: Cambiar estado (X-Request-Id / traceparent)
    API->>DB: Tx: actualiza pago e inserta evento en domain_event_outbox
    Note right of DB: Persiste requestId (correlation_id) y traceparent; de este se obtiene trace_id
    DB-->>API: COMMIT
    API-->>Comercio: 200 OK (requestId)
    Outbox->>DB: Lee eventos pendientes
    DB-->>Outbox: Evento + datos de correlación
    Outbox->>MQ: Publica evento con requestId y traceparent (trace_id)
    MQ-->>Outbox: Confirmación
    Outbox->>DB: Marca evento como publicado

    Note over MQ, DB: 2. Registro idempotente en la cadena de auditoría
    MQ-->>Audit: Entrega evento
    alt Consumidor caído
        MQ-->>MQ: Reintenta entrega; envía a DLQ si agota reintentos
        Audit->>MQ: Se recupera y consume mensaje pendiente
        MQ-->>Audit: Reentrega evento con correlación
    end
    rect rgb(235, 245, 255)
        Note over Audit, DB: Transacción de auditoría, serializada por tenant
        Audit->>DB: BEGIN
        Audit->>DB: Adquiere bloqueo de escritura para el tenant
        Audit->>DB: Comprueba si eventId ya fue registrado
        alt Evento duplicado
            DB-->>Audit: eventId ya existe
            Audit->>DB: COMMIT
            DB-->>Audit: Commit confirmado
            Audit-->>MQ: ACK sin duplicar el registro
        else Evento nuevo
            DB-->>Audit: eventId no existe
            Audit->>DB: Lee el último record_hash del tenant (previousHash)
            DB-->>Audit: previousHash
            Audit->>Audit: Calcula SHA-256 encadenado
            Audit->>DB: INSERT en audit_log (evento, previousHash, hash)
            DB-->>Audit: Registro insertado
            Audit->>DB: COMMIT
            DB-->>Audit: Commit confirmado
            Audit-->>MQ: ACK
        end
    end

    Note over MQ, Comercio: 3. Entrega de webhook y observabilidad
    MQ-->>Webhook: Entrega evento
    Webhook->>Comercio: POST webhook (requestId / traceparent con trace_id)
    Comercio-->>Webhook: Respuesta HTTP
    Webhook->>DB: Registra estado de entrega

    par Métricas
        API-->>Prom: Solicitudes y latencia
        Outbox-->>Prom: Pendientes y antigüedad
        MQ-->>Prom: Mensajes y DLQ
        Webhook-->>Prom: Entregas exitosas y fallidas
    and Alertas
        Prom->>Prom: Evalúa métricas y umbrales
        opt Umbral superado
            Prom-->>Admin: Envía alerta operacional
        end
    end

    Note over Operador, DB: 4. Protección y verificación de integridad
    opt Intento de modificación
        Operador->>DB: UPDATE / DELETE sobre audit_log
        DB-->>Operador: Operación rechazada (permisos / inmutabilidad)
    end
    Admin->>API: GET /admin/audit/verify?tenantId={id}
    API->>DB: Lee audit_log del tenant en orden
    DB-->>API: Registros y hashes
    API->>API: Recalcula y verifica la cadena
    alt Cadena íntegra
        API-->>Admin: 200 OK (valid: true, recordsChecked, verifiedAt)
    else Ruptura detectada
        API-->>Admin: 200 OK (valid: false, firstBrokenEventId, firstBrokenAt)
    end
```

---

## 2. Garantías del flujo

- El cambio del pago y la inserción en `domain_event_outbox` ocurren en la
  misma transacción.
- `requestId` y `traceparent` se propagan desde la API hasta el consumidor y el
  webhook; el `trace_id` identifica la traza W3C contenida en `traceparent`.
- El consumidor de auditoría serializa las escrituras con un bloqueo por
  tenant. Dentro de la misma transacción comprueba `eventId`, lee el
  `previousHash` del tenant e inserta el registro; solo confirma el mensaje a
  RabbitMQ después del `COMMIT`. Los duplicados también se confirman sin crear
  otra fila.
- La verificación informa si la cadena es válida y, si no, identifica el primer
  evento afectado; una ruptura se devuelve como resultado de verificación y no
  impide que la solicitud responda `200 OK`.
