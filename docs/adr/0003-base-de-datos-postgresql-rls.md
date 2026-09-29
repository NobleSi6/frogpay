# ADR-003: Base de datos — PostgreSQL en Supabase con esquema compartido y RLS

- **Estado:** Aceptado
- **Fecha:** 2026-09-29
- **Decisores:** Arquitecto de Software y equipo de desarrollo de FrogPay
- **Relacionados:** [ADR-001](0001-estilo-arquitectonico.md), [ADR-002](0002-mensajeria-rabbitmq.md), [Diagramas C4](../c4/README.md), modelo E-R en `docs/erd/`

## Contexto

FrogPay almacena datos de muchos comercios (tenants) en un mismo sistema. Requisitos:

- **RNF-03:** aislamiento estricto; un tenant nunca puede ver ni modificar datos de otro, aunque exista un error en el código.
- **Transacciones ACID** e integridad: montos exactos, estados válidos e idempotencia de pagos (**RF-06**).
- **RNF-04 / RNF-05:** no almacenar datos de tarjeta y guardar credenciales solo como hash o cifradas.
- **Auditoría** inmutable y métricas para el dashboard.
- **Costo cero** durante el MVP y migraciones versionadas en el repositorio.

Hay dos decisiones: **qué motor y dónde alojarlo**, y **cómo separar los datos de cada tenant**.

## Opciones consideradas

**Modelo multi-tenant**

| Criterio | BD por tenant | Schema por tenant | **Esquema compartido + RLS** |
|---|---|---|---|
| Aislamiento | Máximo | Alto | Alto (lo impone la BD) |
| Costo | Alto | Medio | Bajo |
| Migraciones | N veces | N veces | Una sola vez |
| Reportes globales (Platform Admin) | Difíciles | Difíciles | Simples |
| Escala a muchos tenants | Mala | Regular | Buena |

**Motor y hosting:** PostgreSQL frente a MySQL (sin RLS nativo) y MongoDB (sin integridad referencial ni transacciones relacionales robustas). Para el alojamiento se evaluaron Supabase, AWS RDS y PostgreSQL propio en Docker.

## Decisión

**PostgreSQL 15+ gestionado en Supabase, con esquema compartido y Row Level Security.**

### Organización del modelo (17 tablas)

| Grupo | Tablas | Aislamiento |
|---|---|---|
| Catálogos globales | `role`, `plan`, `payment_method`, `provider` | Sin RLS; solo lectura para la aplicación |
| Raíz del tenant | `tenant` | RLS por `id` |
| Identidad y acceso | `app_user`, `api_key` | RLS por `tenant_id` (`app_user.tenant_id` NULL = Platform Admin) |
| Plan y proveedores | `tenant_plan_usage`, `tenant_provider_credential` | RLS por `tenant_id` |
| Pagos | `payment`, `payment_status_history`, `refund` | RLS por `tenant_id` |
| Webhooks | `webhook`, `webhook_delivery` | RLS por `tenant_id` |
| Eventos, auditoría y métricas | `domain_event_outbox`, `audit_log`, `daily_tenant_metrics` | RLS por `tenant_id` |

### Reglas de integridad del modelo

- **Nada se mezcla entre tenants, ni siquiera por FK.** Las tablas hijas referencian a su padre con **FK compuestas que incluyen el `tenant_id`**: `payment_status_history`, `refund` y `webhook_delivery` apuntan a `payment(id, tenant_id)`, y `webhook_delivery` a `webhook(id, tenant_id)`. La base de datos rechaza, por ejemplo, un reembolso del tenant A sobre un pago del tenant B.
- **Coherencia de proveedores:** `payment → provider(id, payment_method_id)` garantiza que el proveedor soporta el método de pago. `payment → tenant_provider_credential(id, tenant_id, provider_id, environment)` garantiza que la credencial usada es del mismo tenant, del mismo proveedor y del mismo ambiente.
- **Idempotencia (RF-06):** `UNIQUE (tenant_id, idempotency_key)` más `idempotency_body_hash`. La misma clave con el mismo cuerpo devuelve el pago existente; la misma clave con un cuerpo distinto se rechaza. Redis guarda la clave con TTL de 24 h como caché rápida, pero **la garantía final la da la BD**.
- **Dinero:** `numeric(14,2)`, nunca decimales en coma flotante. CHECKs: `amount > 0` y `net_amount = amount - commission_amount`. La moneda sigue ISO 4217 (`^[A-Z]{3}$`, por defecto `BOB`).
- **Estados válidos por CHECK:** pagos (`pending`, `approved`, `rejected`, `failed`, `expired`, `refunded`, `partially_refunded`), usuarios, tenants, entregas de webhook, etc. Todo cambio de estado de un pago se registra en `payment_status_history`.
- **Sandbox y producción** se separan con la columna `environment` en claves, credenciales, pagos y métricas.
- **Una transacción del proveedor no se registra dos veces:** índice único parcial `(provider_id, provider_transaction_id)`.

### Seguridad de datos

- **Sin datos de tarjeta (RNF-04):** no existe ninguna columna para PAN o CVV; solo se guarda la referencia del proveedor.
- **Credenciales (RNF-05):** `api_key.secret_hash` e `app_user.invitation_token` guardan **solo el hash**. `tenant_provider_credential.credentials_encrypted` y `webhook.secret_encrypted` se cifran en la aplicación antes de guardarse, y la clave de cifrado vive en variables de entorno, no en la BD.
- **Rol de aplicación:** la API se conecta como `frogpay_app`, creado con `NOBYPASSRLS`. **Nunca** se conecta como `postgres` ni con la clave `service_role`. El rol no tiene `DELETE` sobre `payment` ni `refund`: los pagos no se borran, cambian de estado.
- **Auditoría append-only:** `audit_log` solo recibe `INSERT` y `SELECT` desde la aplicación.

### Acceso desde la aplicación

- Cada operación corre en una transacción que primero ejecuta `set_config('app.current_tenant_id', <id>, true)` mediante `PrismaTenantContextService.withTenant()`. Las operaciones globales del Platform Admin usan `withGlobalAccess()` de forma explícita. Las políticas usan los helpers `app_current_tenant_id()` y `app_global_access()`, que toleran variables vacías en conexiones reutilizadas del pooler.
- El `tenant_id` sale siempre del JWT o de la API Key, **nunca** del cuerpo ni de la URL.
- **ORM:** Prisma 6. **Fuente de verdad del esquema:** `apps/api/prisma/migrations/`. El modelo se diseña en Redgate Data Modeler, pero su exportación no incluye RLS, políticas, triggers, rol ni índices sobre expresiones; eso se agrega a mano en la migración `0_init`. **Está prohibido `prisma db push`.**
- **Conexión:** la app usa el *transaction pooler* (6543, `pgbouncer=true`) y las migraciones usan el *session pooler* (5432, `DIRECT_URL`). Ambos son compatibles con IPv4, necesario para Docker.
- **Modelo de lectura para el dashboard:** `daily_tenant_metrics` se actualiza al consumir eventos de pago ([ADR-002](0002-mensajeria-rabbitmq.md)), para que el dashboard no recalcule sobre toda la tabla `payment`.

## Consecuencias

**Positivas**
- Una sola migración aplica a todos los tenants y el costo es mínimo.
- **Defensa en profundidad:** el aislamiento lo garantizan tres capas independientes: el `tenant_id` del token, RLS y las FKs compuestas.
- La integridad financiera (montos, estados, idempotencia) está protegida en la BD, no solo en el código.
- Es PostgreSQL estándar: se puede migrar fuera de Supabase con `pg_dump`.

**Negativas y mitigaciones**
- **Una consulta sin contexto devuelve cero filas.** Es seguro, pero puede confundir. → Documentado en `apps/api/README.md`; toda consulta a tablas de tenant pasa por `withTenant()`.
- **Vecino ruidoso.** → Índices `(tenant_id, created_at DESC)` y `(tenant_id, status)`, y límites por plan en `tenant_plan_usage`.
- **La herramienta de modelado y Prisma no expresan RLS, triggers ni CHECKs complejos.** → Migraciones SQL manuales revisadas en cada PR; el diagrama E-R se mantiene sincronizado con ellas.
- **Restricciones del transaction pooler:** transacciones cortas (timeout de 5 s) y **sin llamadas HTTP dentro de `withTenant()`**.
- **Límites del plan gratuito de Supabase.** → Aceptable para el MVP; el paso a RDS queda como alternativa documentada.

## Cumplimiento

- `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'frogpay_app';` debe devolver `false`.
- `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('payment','api_key','app_user','webhook');` debe devolver `true` en todas.
- Prueba de integración entre tenants (TSK-BACK2-203): el tenant A no puede leer ni referenciar datos del tenant B.
- Prueba de idempotencia: dos `POST /payments` con la misma clave crean un solo registro.
