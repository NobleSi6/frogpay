# Diagramas C4 — FrogPay

Modelo C4 de la arquitectura de FrogPay (MVP): **Monolito Modular Orientado a Eventos (EDA)**.

| Nivel | Pregunta que responde |
|---|---|
| 1. Contexto | ¿Quién usa FrogPay y con qué sistemas externos se comunica? |
| 2. Contenedores | ¿Qué aplicaciones y almacenes de datos componen FrogPay? |
| 3. Componentes | ¿Cómo está organizada internamente la API? |

**Leyenda:** azul oscuro = persona · azul = sistema/contenedor de FrogPay · celeste = componente · gris = sistema externo · línea punteada = relación secundaria o de verificación.

---

## Nivel 1 — Diagrama de Contexto

```mermaid
flowchart TB
    admin["<b>Platform Admin</b><br/>[Persona]<br/>Personal de FrogPay que da de alta a los comercios"]
    owner["<b>Owner del comercio</b><br/>[Persona]<br/>Responsable del tenant: gestiona credenciales, plan y ventas"]
    cliente["<b>Cliente final</b><br/>[Persona]<br/>Compra en el comercio y paga con tarjeta o QR/billetera"]

    frogpay["<b>FrogPay</b><br/>[Sistema de software]<br/>Pasarela de pago universal SaaS multi-tenant: crea y procesa pagos, notifica cambios de estado y ofrece un dashboard"]

    comercio["<b>Sistema del comercio</b><br/>[Sistema externo]<br/>E-commerce o app del tenant integrada vía API REST"]
    stripe["<b>Stripe - sandbox</b><br/>[Sistema externo]<br/>Procesador de tarjetas; tokeniza PAN/CVV"]
    qr["<b>Red QR interoperable / Billetera</b><br/>[Sistema externo]<br/>Cobros QR estándar BCB - EMVCo vía EIF aliada"]
    email["<b>Proveedor de email</b><br/>[Sistema externo]<br/>Correos transaccionales"]

    admin -->|"Da de alta tenants<br/>[HTTPS]"| frogpay
    owner -->|"Gestiona API Keys, plan y ve transacciones<br/>[HTTPS]"| frogpay
    cliente -->|"Compra"| comercio
    cliente -.->|"Ingresa su tarjeta en iframe/SDK certificado"| stripe
    comercio -->|"Crea y consulta pagos<br/>[REST + API Key + Idempotency-Key]"| frogpay
    frogpay -->|"Webhooks firmados<br/>[HTTPS + HMAC]"| comercio
    frogpay -->|"Autoriza y captura pagos<br/>[REST, TLS 1.2+]"| stripe
    frogpay -->|"Genera y confirma cobros QR<br/>[REST, mTLS]"| qr
    frogpay -->|"Envía invitaciones<br/>[SMTP/API]"| email
    email -.->|"Correo de invitación"| owner

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#999999,stroke:#6b6b6b,color:#fff
    class admin,owner,cliente person
    class frogpay system
    class comercio,stripe,qr,email external
```

**Decisiones reflejadas**
- **PCI DSS (RNF-04):** el cliente final ingresa su tarjeta directamente en el iframe/SDK del proveedor. FrogPay nunca recibe el PAN ni el CVV, lo que reduce el alcance de auditoría de SAQ D a SAQ A.
- **Interoperabilidad BCB:** los cobros QR usan el estándar interoperable (EMVCo) a través de una EIF aliada, sin esquemas QR propietarios.
- **Alta controlada de tenants (HU-01):** solo el Platform Admin crea comercios. El owner se activa mediante un correo de invitación.

---

## Nivel 2 — Diagrama de Contenedores

```mermaid
flowchart TB
    admin["<b>Platform Admin</b><br/>[Persona]"]
    owner["<b>Owner del comercio</b><br/>[Persona]"]
    comercio["<b>Sistema del comercio</b><br/>[Sistema externo]"]

    subgraph frogpay["FrogPay - Sistema de software"]
        direction TB
        dashboard["<b>Dashboard Web</b><br/>[Contenedor: Next.js + TypeScript]<br/>Landing page, dashboard del tenant y dashboard interno"]
        gateway["<b>API Gateway</b><br/>[Contenedor: Kong / NGINX]<br/>Terminación TLS y rate limiting por tenant"]
        api["<b>API FrogPay</b><br/>[Contenedor: NestJS - monolito modular]<br/>Lógica de negocio, API REST y consumidores de eventos"]
        bus["<b>Bus de eventos</b><br/>[Contenedor: RabbitMQ]<br/>Eventos de dominio, reintentos y Dead-Letter Queue"]
        redis[("<b>Caché</b><br/>[Contenedor: Redis]<br/>Idempotency-Keys, contadores de límites y caché")]
        db[("<b>Base de datos</b><br/>[Contenedor: PostgreSQL en Supabase]<br/>Tenants, pagos y auditoría append-only; RLS por tenant_id")]
    end

    stripe["<b>Stripe - sandbox</b><br/>[Sistema externo]"]
    qr["<b>Red QR / Billetera</b><br/>[Sistema externo]"]
    email["<b>Proveedor de email</b><br/>[Sistema externo]"]

    admin -->|"Usa<br/>[HTTPS]"| dashboard
    owner -->|"Usa<br/>[HTTPS]"| dashboard
    dashboard -->|"Llama a la API<br/>[JSON/HTTPS + JWT]"| gateway
    comercio -->|"Crea y consulta pagos<br/>[REST + API Key]"| gateway
    gateway -->|"Enruta<br/>[HTTP]"| api
    api -->|"Lee y escribe<br/>[Prisma, pooler TLS]"| db
    api -->|"Idempotencia y límites"| redis
    api <-->|"Publica y consume eventos<br/>[AMQP]"| bus
    api -->|"Webhooks firmados<br/>[HTTPS + HMAC]"| comercio
    api -->|"Autoriza pagos<br/>[REST]"| stripe
    api -->|"Cobros QR<br/>[REST, mTLS]"| qr
    api -->|"Correos<br/>[SMTP/API]"| email

    classDef person fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef external fill:#999999,stroke:#6b6b6b,color:#fff
    class admin,owner person
    class dashboard,gateway,api,bus,redis,db container
    class comercio,stripe,qr,email external
    style frogpay fill:none,stroke:#1168bd,stroke-dasharray: 5 5
```

**Decisiones reflejadas**
- **Monolito modular (ADR-001):** un solo contenedor de API agrupa todos los módulos, incluidos los consumidores de eventos. Esto evita la sobrecarga operativa de microservicios en el MVP, y cada módulo puede separarse en su propio contenedor en el futuro.
- **RabbitMQ (ADR-002):** desacopla la respuesta síncrona (menos de 300 ms, RNF-01) de las tareas pesadas: webhooks, auditoría y correos.
- **PostgreSQL + RLS en Supabase (ADR-003):** base compartida con aislamiento por fila según `tenant_id` (RNF-03).
- **Redis:** guarda las Idempotency-Keys con TTL de 24 h (RF-06) y los contadores de límites por plan.
- **Entorno de desarrollo:** `docker-compose.yml` levanta Dashboard, API, Redis y RabbitMQ; la base de datos vive en Supabase. El API Gateway se incorpora en el despliegue de staging/producción.

---

## Nivel 3 — Diagrama de Componentes (API FrogPay)

```mermaid
flowchart TB
    gateway["<b>API Gateway</b><br/>[Contenedor]"]

    subgraph apicont["API FrogPay - Contenedor NestJS"]
        direction TB
        controllers["<b>Controladores REST / BFF</b><br/>[presentation/http]<br/>Endpoints públicos /v1 y endpoints del dashboard"]
        auth["<b>Auth y Contexto de Tenant</b><br/>[shared/auth]<br/>Guards JWT, API Key y Roles; obtiene el tenant_id"]
        identity["<b>Identidad y Tenants</b><br/>[modules/identity]<br/>Alta de tenants, invitaciones, usuarios y API Keys"]
        plans["<b>Planes</b><br/>[modules/plans]<br/>Free / Premium y límites de uso"]
        payments["<b>Pagos - Core</b><br/>[modules/payments]<br/>Ciclo de vida del pago e idempotencia"]
        adapters["<b>Adaptadores de Proveedores</b><br/>[modules/provider-adapters]<br/>PaymentProviderPort + Stripe / QR BCB; circuit breaker y timeout 3 s"]
        webhooks["<b>Webhooks</b><br/>[modules/webhooks]<br/>Firma HMAC, backoff exponencial y DLQ"]
        notifications["<b>Notificaciones</b><br/>[modules/notifications]<br/>Correos de invitación"]
        audit["<b>Auditoría y Métricas</b><br/>[modules/audit]<br/>Registro inmutable y métricas del dashboard"]
        health["<b>Health</b><br/>[modules/health]<br/>Estado de BD, bus y caché"]
        eventbus["<b>EventBus</b><br/>[shared/events]<br/>Publica y suscribe eventos de dominio"]
        prisma["<b>PrismaService</b><br/>[shared/database]<br/>Acceso a datos; fija el tenant para RLS"]
    end

    db[("<b>PostgreSQL</b><br/>[Supabase]")]
    bus["<b>RabbitMQ</b><br/>[Contenedor]"]
    redis[("<b>Redis</b><br/>[Contenedor]")]
    stripe["<b>Stripe</b><br/>[Sistema externo]"]
    qr["<b>Red QR / Billetera</b><br/>[Sistema externo]"]
    email["<b>Proveedor de email</b><br/>[Sistema externo]"]
    comercio["<b>Sistema del comercio</b><br/>[Sistema externo]"]

    gateway --> controllers
    controllers -->|"Protegidos por"| auth
    controllers --> identity
    controllers --> plans
    controllers --> payments
    controllers --> health

    payments -->|"Consulta límite restante"| plans
    payments -->|"Idempotency-Key"| redis
    payments -->|"Cobra vía puerto común"| adapters
    adapters --> stripe
    adapters --> qr

    identity -->|"Publica tenant.creado"| eventbus
    payments -->|"Publica pago.creado / aprobado / rechazado"| eventbus
    eventbus <-->|"AMQP"| bus
    eventbus -->|"tenant.creado"| notifications
    eventbus -->|"pago.*"| webhooks
    eventbus -->|"Todos los eventos"| audit

    notifications --> email
    webhooks -->|"HTTPS + HMAC"| comercio

    identity --> prisma
    plans --> prisma
    payments --> prisma
    audit --> prisma
    prisma --> db

    health -.->|"Verifica"| db
    health -.->|"Verifica"| bus
    health -.->|"Verifica"| redis

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef external fill:#999999,stroke:#6b6b6b,color:#fff
    class controllers,auth,identity,plans,payments,adapters,webhooks,notifications,audit,health,eventbus,prisma component
    class gateway,db,bus,redis container
    class stripe,qr,email,comercio external
    style apicont fill:none,stroke:#438dd5,stroke-dasharray: 5 5
```

**Decisiones reflejadas**
- **Comunicación por eventos:** los módulos no se llaman entre sí directamente. Identidad y Pagos publican eventos, y Notificaciones, Webhooks y Auditoría los consumen de forma asíncrona. La única llamada síncrona entre módulos es Pagos → Planes (límite restante), a través de un servicio exportado.
- **Extensibilidad (RF-16, RNF-07):** Pagos solo conoce `PaymentProviderPort`. Agregar un proveedor nuevo significa agregar un adapter, sin tocar el core.
- **Resiliencia (RNF-08):** los adaptadores aplican timeout de 3 s y circuit breaker. Los webhooks reintentan con backoff (1-2-4-8-16 s) y, al agotar los reintentos, pasan a la DLQ.
- **Aislamiento multi-tenant (RNF-03):** el `tenant_id` se obtiene siempre del JWT o la API Key (componente Auth), y `PrismaService` lo fija en la sesión de PostgreSQL para que RLS filtre cada consulta.
- Cada componente corresponde a una carpeta real del repositorio (ver `apps/api/README.md`).
