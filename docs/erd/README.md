# ERD lógico final de FrogPay

El diagrama Mermaid siguiente representa las entidades y relaciones lógicas
vigentes en `apps/api/prisma/schema.prisma` (18 modelos). Los nombres de campo
se reducen a identificadores y atributos relevantes para lectura. Para tipos,
índices y nulabilidad exactos, usar el schema Prisma y las migraciones SQL.

```mermaid
erDiagram
    ROLE {
        uuid id PK
        string name UK
    }
    APP_USER {
        uuid id PK
        uuid tenant_id FK
        uuid role_id FK
        string email
        string password_hash
    }
    PLAN {
        uuid id PK
        string name UK
        decimal monthly_volume_limit
    }
    TENANT {
        uuid id PK
        uuid plan_id FK
        string tax_id UK
        string status
    }
    API_KEY {
        uuid id PK
        uuid tenant_id FK
        string key_prefix UK
        string secret_hash
        string environment
    }
    TENANT_PLAN_USAGE {
        uuid id PK
        uuid tenant_id FK
        string period
        decimal volume_used
    }
    PAYMENT_METHOD {
        uuid id PK
        string code UK
        string name
    }
    PROVIDER {
        uuid id PK
        uuid payment_method_id FK
        string code UK
        boolean is_active
    }
    TENANT_PROVIDER_CREDENTIAL {
        uuid id PK
        uuid tenant_id FK
        uuid provider_id FK
        string environment
        string credentials_encrypted
    }
    PAYMENT {
        uuid id PK
        uuid tenant_id FK
        uuid provider_id FK
        uuid payment_method_id FK
        string idempotency_key
        decimal amount
        string status
    }
    PAYMENT_STATUS_HISTORY {
        uuid id PK
        uuid payment_id FK
        uuid tenant_id FK
        string previous_status
        string new_status
    }
    REFUND {
        uuid id PK
        uuid payment_id FK
        uuid tenant_id FK
        uuid authorized_by_user_id FK
        decimal amount
        string status
    }
    BANK_TRANSACTION {
        uuid id PK
        uuid tenant_id FK
        uuid payment_id FK
        string external_id
        string reference
        decimal amount
        string status
    }
    WEBHOOK {
        uuid id PK
        uuid tenant_id FK
        string url
        string secret_encrypted
        string environment
    }
    WEBHOOK_DELIVERY {
        uuid id PK
        uuid webhook_id FK
        uuid tenant_id FK
        uuid payment_id FK
        uuid event_id
        string status
    }
    WEBHOOK_DELIVERY_ATTEMPT {
        uuid id PK
        uuid delivery_id FK
        uuid tenant_id FK
        int attempt_number
        boolean succeeded
    }
    DOMAIN_EVENT_OUTBOX {
        uuid id PK
        uuid tenant_id FK
        uuid aggregate_id
        string event_type
        string status
    }
    AUDIT_LOG {
        uuid id PK
        uuid event_id UK
        uuid tenant_id FK
        uuid actor_user_id FK
        string action
        string record_hash
    }
    DAILY_TENANT_METRICS {
        uuid id PK
        uuid tenant_id FK
        date date
        string environment
        decimal total_volume
    }

    ROLE ||--o{ APP_USER : assigns
    PLAN o|--o{ TENANT : subscription
    TENANT o|--o{ APP_USER : contains
    TENANT ||--o{ API_KEY : owns
    TENANT ||--o{ TENANT_PLAN_USAGE : usage
    TENANT ||--o{ TENANT_PROVIDER_CREDENTIAL : configures
    TENANT ||--o{ PAYMENT : owns
    TENANT ||--o{ WEBHOOK : configures
    TENANT ||--o{ WEBHOOK_DELIVERY : owns
    TENANT ||--o{ WEBHOOK_DELIVERY_ATTEMPT : owns
    TENANT ||--o{ BANK_TRANSACTION : receives
    TENANT o|--o{ DOMAIN_EVENT_OUTBOX : emits
    TENANT ||--o{ AUDIT_LOG : records
    TENANT ||--o{ DAILY_TENANT_METRICS : aggregates
    PAYMENT_METHOD ||--o{ PROVIDER : supports
    PROVIDER ||--o{ PAYMENT : processes
    PROVIDER ||--o{ TENANT_PROVIDER_CREDENTIAL : credentials
    TENANT_PROVIDER_CREDENTIAL o|--o{ PAYMENT : authorizes
    PAYMENT ||--o{ PAYMENT_STATUS_HISTORY : transitions
    PAYMENT ||--o{ REFUND : refunded_by
    PAYMENT o|--o{ BANK_TRANSACTION : reconciles
    PAYMENT o|--o{ WEBHOOK_DELIVERY : notifies
    WEBHOOK ||--o{ WEBHOOK_DELIVERY : delivers
    WEBHOOK_DELIVERY ||--o{ WEBHOOK_DELIVERY_ATTEMPT : attempts
    APP_USER o|--o{ AUDIT_LOG : acts
    APP_USER o|--o{ REFUND : authorizes
```

## Reglas de integridad que no se ven completamente en el ERD

- RLS por `tenant_id` protege las tablas tenant-scoped; el rol de aplicación
  debe ser `NOBYPASSRLS`. El contexto tenant se establece en cada transacción.
- Las relaciones financieras usan claves foráneas compuestas con `tenant_id`
  para impedir asociaciones cruzadas. En particular, historial, reembolsos,
  entregas de webhook y depósitos referencian pagos dentro del mismo tenant.
- Una API Key se persiste como hash (`secret_hash`), y credenciales de proveedor
  y secretos de webhook se almacenan cifrados.
- La idempotencia de pago se garantiza con unicidad por tenant y clave.
- Auditoría es append-only; hash encadenado, triggers, permisos y restricciones
  están definidos en migraciones SQL.
- `domain_event_outbox` se escribe en la transacción de negocio y se publica
  con entrega at-least-once.
