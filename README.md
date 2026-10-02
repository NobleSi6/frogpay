# FrogPay

Pasarela de pago universal SaaS multi-tenant (Freemium). Monorepo con npm workspaces.
Arquitectura: **Monolito Modular Orientado a Eventos (EDA)**, con camino de evolución a microservicios.

## Estructura general

```
frogpay/
├── apps/
│   ├── api/              # Backend NestJS — ver apps/api/README.md
│   └── dashboard/        # Frontend Next.js — ver apps/dashboard/README.md
├── packages/
│   └── contracts/        # Tipos compartidos front/back: contratos de eventos y DTOs públicos
├── docs/
│   ├── c4/               # Diagramas C4 nivel 1, 2 y 3 (TSK-ARQ-102)
│   ├── adr/              # Architecture Decision Records (TSK-ARQ-103)
│   └── erd/              # Modelo E-R exportado de Vertabelo (TSK-ARQ/DEVs-100)
├── infra/
│   └── rabbitmq/         # definitions.json: exchanges, colas y DLQ precreadas
├── .github/
│   └── workflows/        # CI: lint, tests y build en cada PR
├── docker-compose.yml    # API, dashboard, Redis, RabbitMQ y Mailpit
├── .env.example          # Variables requeridas SIN valores reales (RNF-15)
└── package.json          # Definición de workspaces y scripts globales
```

| Carpeta | Para qué sirve exactamente |
|---|---|
| `apps/api` | Toda la lógica de negocio, la API REST y los consumidores de eventos. |
| `apps/dashboard` | Landing page, dashboard del tenant y dashboard interno de FrogPay. |
| `packages/contracts` | Única fuente de verdad de las interfaces que comparten front y back (p. ej. `TenantDto`, payload de `tenant.creado`). Evita duplicar tipos. |
| `docs/` | Documentación de arquitectura versionada junto al código. |
| `infra/` | Configuración de infraestructura que no es código de la aplicación. |
| `.github/` | Automatización del repositorio (CI y plantillas). |

## Alta de tenants e invitaciones

`POST /api/tenants` crea el tenant, su owner, las API keys iniciales y el evento
`tenant.creado` dentro de una única transacción con outbox. Responde `201` con
`invitationQueued` y las API keys; cada `rawKey` se muestra una sola vez.
Notifications consume el evento, genera y persiste el hash del token de
activación y envía `/activar-cuenta/{token}?email=...`. El token crudo no se
incluye en el evento. Los errores de entrega reintentan tres veces y los fallos
del consumidor terminan en la DLQ.

En API keys, `OWNER` y `ADMIN` quedan limitados al tenant de `@CurrentTenant`;
el `tenantId` de la ruta no cambia su alcance. Solo `PLATFORM_ADMIN` puede
seleccionar el tenant de la ruta.

El stack de desarrollo conserva API, Dashboard, Redis, RabbitMQ y Mailpit.
Mailpit ofrece la bandeja local en `http://localhost:8025`.
## Documentación de arquitectura
- [Diagramas C4 (Contexto, Contenedores y Componentes)](docs/c4/README.md)
- [Decisiones de arquitectura (ADRs)](docs/adr/README.md)

## Reglas globales

1. **Ningún secreto en el código.** Todo va en `.env` (ignorado por git). Solo `.env.example` se versiona.
2. Los tipos compartidos entre front y back se definen **solo** en `packages/contracts`.
3. Toda decisión arquitectónica relevante se registra como ADR en `docs/adr/`.

## Desarrollo local

Consulta la [guía de puesta en marcha](docs/GUIA-PUESTA-EN-MARCHA.md) para conocer las dependencias, configurar el `.env` y ejecutar los servicios.
