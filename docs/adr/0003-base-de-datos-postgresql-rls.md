# ADR-003: Base de datos — PostgreSQL en Supabase con esquema compartido y RLS

- **Estado:** Aceptado
- **Fecha:** 2026-09-29
- **Decisores:** Arquitecto de Software y equipo de desarrollo de FrogPay
- **Relacionados:** [ADR-001](0001-estilo-arquitectonico.md), [Diagramas C4](../c4/README.md)

## Contexto

FrogPay almacena datos de muchos comercios (tenants) en un mismo sistema. Requisitos:

- **RNF-03:** aislamiento estricto; un tenant nunca puede ver ni modificar datos de otro, aunque exista un error en el código.
- **Transacciones ACID** e integridad de datos: montos decimales exactos, estados válidos, idempotencia por `(tenant_id, idempotency_key)`.
- **Auditoría append-only:** los registros de auditoría no se modifican ni se borran.
- **Costo cero** para el equipo durante el MVP y migraciones versionadas en el repositorio.

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

**Motor y hosting:** PostgreSQL frente a MySQL (sin RLS nativo) y MongoDB (sin transacciones relacionales ni integridad referencial robusta). Para el alojamiento se evaluaron Supabase, AWS RDS y PostgreSQL propio en Docker.

## Decisión

- **Motor:** PostgreSQL 15+, gestionado en **Supabase**.
- **Multi-tenant:** esquema compartido. Toda tabla con datos de un comercio tiene `tenant_id NOT NULL` y una política de **Row Level Security**.
- **Rol de aplicación:** la API se conecta como `frogpay_app`, creado con `NOBYPASSRLS`. **Nunca** se conecta como `postgres` ni con la clave `service_role`.
- **Contexto por solicitud:** cada operación corre en una transacción que primero ejecuta `set_config('app.current_tenant_id', <id>, true)` mediante `PrismaTenantContextService.withTenant()`. Las operaciones globales del Platform Admin usan `withGlobalAccess()` de forma explícita.
- **Origen del tenant:** el `tenant_id` sale siempre del JWT o de la API Key, nunca del cuerpo ni de la URL de la solicitud.
- **ORM:** Prisma 6. Lo que Prisma no puede expresar (RLS, CHECK, triggers, índices parciales) va en migraciones SQL dentro de `apps/api/prisma/migrations`. **Está prohibido `prisma db push`.**
- **Conexión:** la app usa el *transaction pooler* (puerto 6543, `pgbouncer=true`) y las migraciones usan el *session pooler* (puerto 5432, `DIRECT_URL`). Ambos son compatibles con IPv4, necesario para Docker.
- **Redis** solo guarda datos efímeros, como las Idempotency-Keys con TTL de 24 h. No es fuente de verdad.

## Consecuencias

**Positivas**
- Una sola migración aplica a todos los tenants y el costo es mínimo.
- **Defensa en profundidad:** aunque el código olvide filtrar por `tenant_id`, la base de datos no devuelve filas de otro tenant.
- Transacciones ACID e integridad referencial para pagos, reembolsos e historial de estados.
- Es PostgreSQL estándar: se puede migrar fuera de Supabase con `pg_dump` si hiciera falta.

**Negativas y mitigaciones**
- **Una consulta sin contexto devuelve cero filas.** El comportamiento es seguro, pero puede confundir. → Documentado en `apps/api/README.md`; toda consulta a tablas de tenant pasa por `withTenant()`.
- **Vecino ruidoso:** un tenant muy activo afecta a los demás. → Índices por `(tenant_id, created_at)` y límites de uso por plan.
- **Prisma no modela RLS.** → Migraciones SQL manuales, revisadas en cada PR.
- **Restricciones del transaction pooler:** `set_config` debe ser local a la transacción, las transacciones deben ser cortas (timeout de 5 s) y **no se hacen llamadas HTTP dentro de `withTenant()`**.
- **Límites del plan gratuito de Supabase** (conexiones, pausa por inactividad). → Aceptable para el MVP; el paso a RDS está documentado como alternativa.

## Cumplimiento

- `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'frogpay_app';` debe devolver `false`.
- Pruebas de `PrismaTenantContextService` y una prueba de integración entre tenants (TSK-BACK2-203): el tenant A no puede leer datos del tenant B.
