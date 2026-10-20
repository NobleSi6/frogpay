# C4 nivel 3 — Componentes de la API

```mermaid
flowchart TB
    client["Comercio / Dashboard"]

    subgraph api["FrogPay API — NestJS"]
        http["Controllers REST<br/>Identity, Payments, Dashboard,<br/>Webhooks, Audit, Health"]
        guards["Authentication / API Key / RBAC guards"]

        subgraph domains["Módulos de dominio"]
            identity["Identity<br/>tenants, usuarios, API Keys"]
            plans["Plans<br/>suscripciones y límites"]
            payments["Payments<br/>casos de uso, estado, idempotencia"]
            dashboards["Dashboard<br/>BFF, pagos y métricas"]
            webhooks["Webhooks<br/>HMAC, entregas y reintentos"]
            audit["Audit<br/>append-only, hash encadenado"]
            notifications["Notifications<br/>correo de invitación"]
            health["Health + Platform Status"]
            simulators["Simulators<br/>sandbox"]
        end

        registry["PaymentProviderRegistry<br/>resolución método → adapter"]
        breaker["Circuit Breaker<br/>aislado por proveedor"]
        adapters["PaymentProviderPort<br/>Stripe / QR local / transferencia"]
        outbox["Outbox Publisher<br/>entrega at-least-once"]
        eventBus["IEventBus<br/>RabbitMQ"]
        observability["Observability<br/>métricas / tracing / logs"]
        prisma["PrismaTenantContextService<br/>transacciones + tenant context"]
    end

    database[("PostgreSQL<br/>RLS")]
    redis[("Redis")]
    rabbitmq[("RabbitMQ")]
    provider["Proveedores externos / locales"]
    mail["SMTP / Mailpit"]

    client --> http
    http --> guards
    guards --> identity
    guards --> payments
    guards --> dashboards
    identity --> prisma
    payments --> plans
    payments --> registry
    registry --> breaker --> adapters --> provider
    payments --> prisma
    payments -->|"escribe evento en misma transacción"| database
    prisma --> database
    payments --> redis
    payments --> outbox
    outbox --> eventBus --> rabbitmq
    rabbitmq --> webhooks
    rabbitmq --> audit
    rabbitmq --> notifications
    webhooks --> prisma
    audit --> prisma
    dashboards --> prisma
    dashboards --> redis
    notifications --> mail
    health --> database
    health --> rabbitmq
    observability --> http
```

**Lectura del diagrama:** las rutas HTTP autentican/autorizan antes de ejecutar
casos de uso. Pagos selecciona proveedores por interfaz y registry; no importa
directamente sus SDKs. Los cambios financieros escriben el evento en el outbox
dentro de la transacción de negocio y el publicador lo entrega a RabbitMQ. Los
consumidores de Webhooks, Auditoría y Notifications reaccionan de forma
asíncrona. Las consultas tenant-scoped pasan por el contexto transaccional que
establece la variable usada por las políticas RLS.

`Observability` es un módulo transversal del proceso API. No es un servicio de
negocio independiente ni se comunica directamente con todos los módulos a
través de una API remota.
