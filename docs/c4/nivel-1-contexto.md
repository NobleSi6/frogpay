# C4 nivel 1 — Contexto del sistema

```mermaid
flowchart LR
    merchant["Comercio / integrador<br/>Crea pagos y recibe webhooks"]
    owner["Gestor del comercio<br/>OWNER / ADMIN / OPERATOR / VIEWER"]
    platformAdmin["Administrador FrogPay<br/>PLATFORM_ADMIN"]

    subgraph frogpay["FrogPay — plataforma de pagos multi-tenant"]
        dashboard["Dashboard Web<br/>Gestión de comercios, pagos y operación"]
        platform["API FrogPay<br/>Identidad, pagos, webhooks, auditoría y métricas"]
    end

    stripe["Stripe<br/>Proveedor externo de tarjetas"]
    banking["Banco / red QR<br/>Integración simulada/local en MVP"]
    mail["Servicio de correo<br/>Mailpit local o proveedor configurado"]

    merchant -->|"HTTPS /v1/*<br/>API Key + Idempotency-Key"| platform
    platform -->|"Webhook HMAC firmado"| merchant
    owner -->|"HTTPS"| dashboard
    platformAdmin -->|"HTTPS"| dashboard
    dashboard -->|"REST /api/*<br/>JWT y RBAC"| platform
    platform -->|"PaymentProviderPort"| stripe
    platform -->|"Adapters locales"| banking
    platform -->|"SMTP"| mail
```

**Alcance:** el sistema ofrece API de pagos y una interfaz de gestión. Los
comercios integran sus servidores con la API y validan la firma HMAC de los
webhooks salientes. Los gestores y administradores usan el Dashboard con roles
separados. Stripe es el proveedor externo de tarjeta; QR y transferencia se
integran con adapters del MVP.
