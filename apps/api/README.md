# FrogPay API

NestJS + Prisma + PostgreSQL (Supabase, con RLS) + RabbitMQ + Redis.

## Consulta del detalle de un pago

El endpoint autenticado con API Key para consultar un pago es:

```http
GET /api/v1/payments/{id}
X-Api-Key: <key_prefix>.<secret>
```

`id` debe ser el UUID del pago. La consulta está limitada al tenant asociado a
la API Key; si el pago no existe o pertenece a otro tenant, responde `404`.
Un ID con formato inválido responde `400` y una API Key ausente o inválida
responde `401`.

La respuesta `200` contiene los datos del pago y el historial cronológico de
transiciones de estado (`statusHistory`):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "status": "approved",
  "amount": "100.00",
  "currency": "BOB",
  "paymentMethod": "card",
  "environment": "sandbox",
  "merchantReference": "ORD-10293",
  "commissionAmount": "3.50",
  "netAmount": "96.50",
  "providerTransactionId": "pi_example",
  "errorCode": null,
  "createdAt": "2026-09-29T14:32:01.000Z",
  "updatedAt": "2026-09-29T14:32:04.000Z",
  "statusHistory": [
    {
      "previousStatus": null,
      "newStatus": "pending",
      "metadata": {},
      "createdAt": "2026-09-29T14:32:01.000Z"
    },
    {
      "previousStatus": "pending",
      "newStatus": "approved",
      "metadata": {},
      "createdAt": "2026-09-29T14:32:04.000Z"
    }
  ]
}
```

Para presentar el detalle como en la pantalla de pagos, el frontend puede
mapear `amount`, `currency`, `commissionAmount`, `netAmount`,
`paymentMethod` y `merchantReference` a sus etiquetas visibles, y renderizar
`statusHistory` como la línea de tiempo de estados. El historial puede ser un
arreglo vacío si todavía no hay transiciones registradas. Las fechas se
devuelven en ISO 8601 UTC; la interfaz puede formatearlas para la zona horaria
del usuario.

`GET /api/v1/payments/{id}` usa el caso de uso de consulta, que proporciona los
campos del pago junto con `statusHistory`; el tipo de respuesta y el esquema
Swagger del controlador reflejan ese contrato. No se altera el procesamiento
del pago. La respuesta de creación `POST /api/v1/payments` conserva su contrato
`PaymentResponseDto` sin `statusHistory`.

## Estructura

```
apps/api/
├── prisma/
│   ├── schema.prisma         # Modelo de datos (fuente: ERD de Vertabelo)
│   ├── migrations/           # Migraciones generadas por Prisma. No se editan a mano
│   └── seed.ts               # Datos iniciales: planes Free y Premium
├── src/
│   ├── main.ts               # Bootstrap de la app
│   ├── app.module.ts         # Módulo raíz: solo importa módulos
│   ├── config/               # Carga y validación de variables de entorno (falla al arrancar si falta alguna)
│   ├── shared/               # Código transversal, SIN lógica de negocio
│   │   ├── domain/           # Clases base: Entity, DomainEvent, Result
│   │   ├── events/           # Interfaz EventBus, implementación RabbitMQ, catálogo de nombres de eventos
│   │   ├── database/         # PrismaService y contexto de tenant para RLS
│   │   ├── auth/             # Guards (JWT, ApiKey, Roles) y decoradores (@CurrentTenant, @Roles)
│   │   ├── http/             # Filtros de excepción, interceptores y formato estándar de error
│   │   └── utils/            # Helpers puros (fechas, dinero, ids)
│   └── modules/              # Un módulo = un dominio de negocio
│       ├── identity/         # Tenants, usuarios, invitaciones, login, API Keys
│       ├── plans/            # Planes Free/Premium y límites de uso
│       ├── payments/         # Núcleo de pagos (ciclo de vida, idempotencia)
│       ├── provider-adapters/# Integraciones con proveedores (Adapter + Strategy)
│       ├── webhooks/         # Envío firmado (HMAC) a tenants, reintentos y DLQ
│       ├── notifications/    # Correos (invitación de owner)
│       ├── audit/            # Log de auditoría inmutable (append-only)
│       └── health/           # Endpoint /health
└── test/
    ├── integration/          # Pruebas contra BD y bus reales (docker compose)
    └── e2e/                  # Flujos completos por HTTP
```

Desde la raíz del repositorio, aplica las migraciones y carga los catálogos antes
de registrar tenants:

```sh
npm exec -w apps/api -- prisma migrate deploy
npm run db:seed -w apps/api
```

### Estructura interna de cada módulo de negocio

```
modules/identity/
├── domain/                   # El "qué": reglas de negocio puras, sin NestJS ni Prisma
│   ├── entities/             # Tenant, User, ApiKey
│   ├── value-objects/        # Email, TaxId, UserStatus (invited/active)
│   ├── events/               # Eventos que emite el módulo: tenant.creado, usuario.activado
│   └── repositories/         # INTERFACES (puertos) de persistencia
├── application/              # El "cómo": orquesta el dominio
│   ├── use-cases/            # CreateTenant, ActivateAccount, GenerateApiKey…
│   ├── dto/                  # Entrada/salida validada (class-validator)
│   └── event-handlers/       # Reacciones a eventos de OTROS módulos
├── infrastructure/           # Detalles técnicos intercambiables
│   └── persistence/          # Implementación Prisma de los repositorios
├── presentation/
│   └── http/                 # Controllers REST (delgados: validan y llaman a un use-case)
└── identity.module.ts
```

Módulos especiales:

- `provider-adapters/`: `ports/` define la interfaz `PaymentProviderPort`; `adapters/stripe` y `adapters/qr-bcb` la implementan; `registry/` elige el adapter por configuración (Strategy). Agregar un proveedor = agregar una carpeta en `adapters/` sin tocar `payments/` (RF-16, RNF-07).
- `health/`: `indicators/` revisa la API, la BD y RabbitMQ; responde 200 o 503.

### Dónde va cada tarea del Sprint 1

| Tarea | Carpeta |
|---|---|
| TSK-ARQ/DEVs-100 Modelo E-R y migraciones | `prisma/`, `docs/erd/` |
| TSK-DEV1-101 POST /tenants | `modules/identity` |
| TSK-BACK1-102 API Key / Secret | `modules/identity` (`infrastructure/` para el hash) |
| TSK-BACK1-103 Correo de invitación | `modules/notifications` (consume `tenant.creado` desde outbox/RabbitMQ) |
| TSK-BACK2-201 / 202 Planes | `modules/plans`, `prisma/seed.ts` |
| TSK-BACK2-203 RLS | `shared/database`, `prisma/migrations` |
| TSK-ARQ/BACK1-104 Bus de eventos | `shared/events`, `infra/rabbitmq` |
| TSK-BACK1-105 /health | `modules/health` |

## Reglas de la arquitectura

### Invitaciones por correo (TSK-BACK1-103)

El alta persiste el tenant y `tenant.creado` en una única transacción. El outbox
publica el evento en RabbitMQ y `modules/notifications` genera el token de
invitación y consume el evento. El correo se reintenta tres veces; si el proveedor
sigue fallando, el evento va a la DLQ y el alta no se revierte ni responde error
por una caída temporal del correo.

En desarrollo, inicia Mailpit con `docker compose up -d mailpit`. La bandeja
queda disponible en `http://localhost:8025` y la API se conecta por SMTP a
`localhost:1025`; no hace falta dominio ni cuenta externa. `MAIL_PROVIDER` usa
Mailpit por defecto en `development`. El enlace es
`/activar-cuenta/{token}?email={email}`; Front envía esos valores y la contraseña
a `POST /api/identity/activate-invitation`. Para producción, configura
`MAIL_PROVIDER=resend`, `RESEND_API_KEY` y `MAIL_FROM` con un remitente de un
dominio verificado.
`FRONTEND_URL` define la base del enlace de activación; por defecto es
`http://localhost:3000`. Al crear un tenant, el owner recibe un enlace válido por
72 horas. El endpoint activa la cuenta y guarda la contraseña con scrypt. El
token se guarda como hash y no se devuelve en la respuesta ni se publica en el
evento.

El endpoint de creación responde `invitationQueued`; la entrega final se puede
revisar en los logs de Notifications, RabbitMQ y Mailpit/Resend.

### Aislamiento de API keys

En `POST`, `GET` y `DELETE /api/tenants/:tenantId/api-keys`, los roles `OWNER`
y `ADMIN` operan siempre sobre el tenant del contexto autenticado
(`@CurrentTenant`); el `tenantId` de la ruta no cambia ese alcance. Solo
`PLATFORM_ADMIN` puede seleccionar el tenant usando la ruta.

### Bus RabbitMQ (TSK-ARQ/BACK1-104)

Desde la raíz del repositorio, configura `RABBITMQ_USER` y `RABBITMQ_PASS` en
`.env` (usa `.env.example` como referencia) e inicia el broker con
`docker compose up -d rabbitmq`. La interfaz de administración está disponible
en `http://localhost:15672`; el puerto AMQP local es `5672`. Copia esas
credenciales a `apps/api/.env` para ejecutar la API desde el host; por defecto,
la API construye la URL local con esas credenciales. En otros entornos puedes
definir explícitamente `RABBITMQ_URL`.

El bus usa el exchange durable `frogpay.events` (topic), mensajes persistentes,
confirmación del broker y una DLQ por cada cola consumidora. Tenants, Pagos y
Adapters tienen colas independientes. Al iniciar la API en `development` se
publica `arquitectura.prueba`; queda disponible en `frogpay.events.smoke` y los
tres esqueletos registran su consumo en los logs. `/health` consulta la conexión
real con RabbitMQ. En producción, configura `RABBITMQ_URL` con el hostname
interno del broker y no expongas el puerto de administración públicamente.

1. **Regla de dependencia:** `presentation → application → domain`. `domain/` nunca importa NestJS, Prisma ni nada de `infrastructure/`.
2. **Los módulos no se importan entre sí por dentro.** Se comunican por **eventos** del bus. La única excepción son consultas síncronas imprescindibles (p. ej. "límite restante del plan"), que se hacen a través de un servicio que el módulo **exporta explícitamente**.
3. **El `tenant_id` nunca viene del body.** Siempre se obtiene del JWT o de la API Key (`@CurrentTenant`).
4. **RLS con Prisma:** la API se conecta a Supabase con un rol **sin** `BYPASSRLS` (nunca como `postgres`). En cada request, `shared/database` ejecuta la consulta dentro de una transacción que primero hace `set_config('app.current_tenant', <id>, true)`, y las políticas RLS filtran por ese valor.
5. **Nombres de eventos:** `<dominio>.<acción en participio>` en español: `tenant.creado`, `pago.aprobado`. Las colas se nombran `<modulo>.<evento>` y su DLQ `<cola>.dead`
   (el routing key de la dead-letter queue es `<cola>.dead`, no `.dlq`; ver `docs/eventos.md`).
6. **Pruebas unitarias** junto al archivo (`create-tenant.use-case.spec.ts`). Las de integración y e2e van en `test/`.
7. **Idioma:** el código (clases, carpetas, variables) va en inglés; los eventos y los mensajes al usuario, en español.
