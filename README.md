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
│   ├── c4/               # Diagramas C4 Mermaid niveles 1, 2 y 3 + despliegue
│   ├── adr/              # Architecture Decision Records (TSK-ARQ-103)
│   ├── flows/            # Diagramas de secuencia y flujos de negocio
│   └── erd/              # ERD Mermaid alineado con el schema Prisma
├── infra/
│   └── rabbitmq/         # definitions.json: exchanges, colas y DLQ precreadas
├── .github/
│   └── workflows/        # CI: lint, tests y build en cada PR
├── docker-compose.yml    # API, dashboard, PostgreSQL, Redis, RabbitMQ y Mailpit
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

El stack local incluye API, Dashboard, PostgreSQL, Redis, RabbitMQ y Mailpit.
NGINX con TLS se habilita mediante el perfil `proxy`. Mailpit ofrece la bandeja
local en `http://localhost:8025`.

## Ejecución con Docker Compose

Requisitos: Docker Desktop con Compose y Node.js/npm si se desea ejecutar
comandos de workspace fuera de Docker. Desde la raíz:

```bash
cp .env.example .env
```

En PowerShell, usa `Copy-Item .env.example .env`. Completa los valores de
desarrollo antes de iniciar.
No uses credenciales productivas ni compartas `.env`.

Para el stack completo con proxy TLS:

```bash
docker compose --profile proxy up --build -d
docker compose ps
```

El API no publica `localhost:4000` en el Compose normal. Configura
`NEXT_PUBLIC_API_URL=https://localhost:8443` en el `.env` raíz para que el
Dashboard del navegador llame al API mediante NGINX; reconstruye Dashboard si
cambias una variable `NEXT_PUBLIC_*`. La configuración de base de datos debe
usar `postgres:5432` desde los contenedores si se elige el PostgreSQL local, o
una instancia de desarrollo accesible desde Docker. Para PostgreSQL local,
crea el rol runtime `frogpay_app` con `NOBYPASSRLS` y define `DATABASE_URL`
para ese rol y `DIRECT_URL` para la cuenta de migración. El procedimiento está
detallado en la [guía de puesta en marcha](docs/GUIA-PUESTA-EN-MARCHA.md).

Direcciones locales:

- Dashboard: <http://localhost:3001>
- API / Swagger: <https://localhost:8443/api/docs>
- Health: <https://localhost:8443/health>
- Mailpit: <http://localhost:8025>
- RabbitMQ management: <http://localhost:15672>
- PostgreSQL local: `127.0.0.1:5433` (no exponerlo públicamente)

El certificado TLS local es autofirmado y el navegador mostrará una advertencia.
Esto es solo para desarrollo.

## Pruebas y validación

Instalar dependencias desde la raíz si se ejecutan los comandos en el host:

```bash
npm ci
```

Comandos disponibles:

```bash
npm run lint
npm test
npm run build
npm run test:e2e --workspace apps/api
```

El e2e del API requiere una base de pruebas y las dependencias de test
configuradas; no apuntar las pruebas a datos productivos. Para migraciones y
seed local, seguir la guía de puesta en marcha.

## Documentación de arquitectura
- [Diagramas C4 (Contexto, Contenedores y Componentes)](docs/c4/README.md)
- [Diagrama de despliegue Mermaid](docs/c4/despliegue.md)
- [ERD lógico Mermaid](docs/erd/README.md)
- [Runbook de operación](docs/runbook-operacion.md)
- [Hoja de ruta posterior al MVP](docs/hoja-de-ruta-post-mvp.md)
- [Validación final de RNF](docs/validacion-final.md)
- [Decisiones de arquitectura (ADRs)](docs/adr/README.md)
- [Contrato de pagos](docs/api/pagos.md)
- [Contratos del Dashboard y administración](docs/api/dashboard.md)
- [Catálogo de errores](docs/api/errores.md)
- [Eventos, Outbox y consumidor de Auditoría](docs/eventos.md)
- [Flujo de auditoría inmutable y observabilidad (TSK-ARQ-401)](docs/flows/auditoria-inmutable-observabilidad.md)
- [Observabilidad: métricas, logs y alertas](docs/observabilidad.md)
- [Pruebas manuales de transferencia y conciliación bancaria](docs/PRUEBAS-MANUALES-CONCILIACION-BANCARIA.md)
- [Estado de tareas de Sprint 3](docs/ESTADO-TAREAS-SPRINT3.md)
- [Manual de usuario](docs/MANUAL-USUARIO.md)
- [Auditoría, integridad y retención](docs/AUDITORIA-Y-RETENCION.md)

## Reglas globales

1. **Ningún secreto en el código.** Todo va en `.env` (ignorado por git). Solo `.env.example` se versiona.
2. Los tipos compartidos entre front y back se definen **solo** en `packages/contracts`.
3. Toda decisión arquitectónica relevante se registra como ADR en `docs/adr/`.

## Desarrollo local

Consulta la [guía de puesta en marcha](docs/GUIA-PUESTA-EN-MARCHA.md) para
configurar `.env`, provisionar una base de desarrollo y ejecutar el stack.
