# Eventos de dominio y Outbox (TSK-ARQ-205)

> Complementa `docs/adr/0002-mensajeria-rabbitmq.md`.
> Archivos de código: `apps/api/src/shared/events/outbox-event-publisher.service.ts`
> y `apps/api/src/shared/domain/domain-event.base.ts`.

## De la fila al sobre

Quien emite un evento escribe **una fila** en `domain_event_outbox` dentro de la
misma transacción que el cambio de negocio. Solo guarda el **objeto de negocio**
en `payload`; el resto de columnas es la fuente de verdad:

| Columna | Uso al publicar |
|---|---|
| `id` | `eventId` (y `messageId` de RabbitMQ) |
| `event_type` | `eventName` |
| `aggregate_id` | `aggregateId` |
| `tenant_id` | `tenantId` |
| `created_at` | `occurredOn` |
| `payload` | `payload` |

El sobre se arma **al publicar**, nunca se persiste completo. Ejemplo real
(`pago.aprobado`):

```json
{
  "eventId": "5f0c9e1a-8f2b-4a53-9d4e-1c2b3a4f5e6d",
  "eventName": "pago.aprobado",
  "aggregateId": "1c2b3a4f-5e6d-4a53-9d4e-8f2b3a4f5e6d",
  "tenantId": "9d4e1c2b-3a4f-5e6d-4a53-9d4e1c2b3a4f",
  "occurredOn": "2026-09-29T00:00:00.000Z",
  "payload": {
    "paymentId": "1c2b3a4f-5e6d-4a53-9d4e-8f2b3a4f5e6d",
    "amount": "15.00",
    "currency": "BOB",
    "paymentMethod": "card",
    "environment": "sandbox",
    "merchantReference": "ref-205",
    "commissionAmount": "0.45",
    "netAmount": "14.55",
    "providerTransactionId": "provider-tx-1"
  }
}
```

`tenantId` va **siempre** en el JSON (`null` cuando la fila no tiene tenant).

**Excepción legada:** `tenant.creado` (escrito por `modules/identity` en
`apps/api/src/modules/identity/infrastructure/persistence/prisma-identity.repositories.ts:44-91`)
guarda el sobre completo dentro de `payload`. El publicador solo lo reconoce
cuando están presentes las cuatro claves `eventId`/`eventName`/`aggregateId`/
`occurredOn`, desenvuelve el `payload` interior y, de todas formas, usa **las
columnas** como fuente de verdad para `eventId`, `eventName`, `aggregateId`,
`tenantId` y `occurredOn`.

## Estados

| `status` | Significado |
|---|---|
| `pending` | Pendiente de publicar (o pendiente de reintento). |
| `published` | Confirmado por el broker; `published_at` marcado y `last_error = null`. |
| `failed` | No se pudo publicar. Requiere intervención manual (ver abajo). |

## Reintentos y backoff

Constantes al inicio de `outbox-event-publisher.service.ts`:

- `MAX_ATTEMPTS = 20`.
- **Fallo transitorio** (`bus.publish` rechaza): se incrementa `attempt_count` y
  se guarda `last_error` (máx. 1000 caracteres). Al llegar a `MAX_ATTEMPTS` la
  fila pasa a `failed` y se registra `logger.error` con `id` y `event_type`.
  El ciclo **corta el lote**: las filas siguientes no se intentan hasta el
  próximo ciclo.
- **Error permanente** (el `payload` no es un objeto JSON válido): la fila pasa
  a `failed` de inmediato, **sin llamar al bus**, con el motivo en `last_error` y
  `logger.error`; el lote continúa con la siguiente fila.
- **Éxito**: `status='published'`, `published_at`, `attempt_count + 1`,
  `last_error=null`.

Backoff a nivel de planificación (en `scheduleFlush`, no en `flushOnce`): tras
un ciclo con fallo transitorio se espera `min(1000 * 2^n, 30000)` ms antes del
siguiente ciclo, donde `n` es el número de ciclos consecutivos con fallo
transitorio (primer backoff: `n = 1` → 2000 ms). `n` vuelve a `0` tras un ciclo
sin fallos transitorios. No usa columnas nuevas: el estado vive en el proceso.

El poll normal es de 1000 ms (`POLL_INTERVAL_MS`) con lotes de 20 filas
(`BATCH_SIZE`).

## Garantía de entrega

**At-least-once.** El mismo evento puede publicarse más de una vez (p. ej. si el
broker confirma pero la fila queda `pending` por un corte entre medio). Por eso
**el consumidor deduplica por `messageId`**, que es idéntico a `eventId` y, a su
vez, al `id` de la fila. El handler no debe asumir exactamente-una-vez.

## Cómo reencolar un `failed`

```sql
UPDATE domain_event_outbox
SET status = 'pending', attempt_count = 0, last_error = NULL
WHERE id = '<id-de-la-fila>';
```

Conviene revisar `last_error` antes de reencolar; si el motivo es un payload
malformado, la fila volverá a `failed` en el primer ciclo.

## Verificación

- **Unitarios** — `npm run test -w apps/api`
  (`src/shared/events/outbox-event-publisher.service.spec.ts`): armado del sobre,
  sobre legado desenvuelto, payload inválido → `failed` sin publicar, corte del
  lote ante fallo transitorio, backoff, agotamiento de `MAX_ATTEMPTS` y
  re-publicación con el mismo `eventId`.
- **E2E real** — `npm run test:e2e -w apps/api -- outbox-publisher`
  (`test/outbox-publisher.e2e-spec.ts`): usa PostgreSQL y RabbitMQ locales. Inicia
  `docker compose up -d postgres rabbitmq`; define `DATABASE_URL` y `DIRECT_URL`
  en el entorno del proceso para apuntar a Postgres en `127.0.0.1:5433`, aplica
  `prisma migrate deploy` y ejecuta el e2e sin modificar `.env`. La migración
  inicial requiere que existan los roles locales `frogpay_app`, `anon` y
  `authenticated`, creados fuera del historial de migraciones.
  El e2e aborta con un mensaje explícito si `DATABASE_URL` contiene `supabase`,
  salvo que se defina intencionalmente `ALLOW_SHARED_DB=1`; no habilites esa
  excepción para una base compartida.
  Cubre, de extremo a extremo:
  1. fila `pending` → mensaje en `frogpay.events` con las propiedades correctas
     (`messageId`, `type`, `contentType`, `deliveryMode=2`, routing key =
     `event_type`, `timestamp`) y el sobre JSON esperado;
  2. desenvolvimiento del sobre legado `tenant.creado` usando las columnas;
  3. payload inválido → `failed` con `last_error` y **sin** mensaje en el broker;
  4. fallo transitorio simulado en el bus → fila `pending` con `attempt_count` y
     `last_error`, y recuperación publicando el **mismo** `eventId`;
  5. el poll de 1 s publica filas pendientes sin intervención manual.

La suite e2e completa (incluye los specs con mocks de health y dashboard) es
`npm run test:e2e -w apps/api`.

## Limitaciones conocidas

- **Sin `SELECT ... FOR UPDATE SKIP LOCKED`.** El poll selecciona los pendientes
  sin bloquear filas. Hoy hay una sola réplica de la API, así que no hay dos
  procesos publicando a la vez; hay que revisarlo al escalar (RNF-06) para no
  duplicar publicaciones.
- **Sin backoff ante errores al consultar la base.** Si la consulta del lote
  falla, se registra el error y el siguiente sondeo vuelve a ocurrir en el
  intervalo normal.
- **Bloqueo del lote por rechazo del broker.** Un evento que el broker rechaza
  corta el lote y se reintenta en ciclos sucesivos; las filas posteriores quedan
  bloqueadas hasta que ese evento se publique o alcance `MAX_ATTEMPTS` y pase a
  `failed`.
- **Exchange topic sin cola ligada descarta el mensaje.** RabbitMQ confirma la
  publicación aunque ninguna cola esté ligada con esa routing key: la
  confirmación del broker no garantiza que alguien lo consuma.
- **Los eventos `failed` requieren intervención manual.** No hay redrive
  automático; ver el `UPDATE` de la sección anterior.
- **Base de datos compartida entre desarrolladores.** `flushOnce` publica todos
  los `pending` de la tabla sin filtro de origen: cualquier instancia local con
  el timer activo puede consumir (y marcar `published`) los eventos escritos por
  otros. Mitigación: `OUTBOX_PUBLISHER_ENABLED` (por defecto `false` cuando
  `NODE_ENV != 'production'`, `true` en producción, sobrescribible por env) hace
  que `onApplicationBootstrap` no arranque el timer y solo loguee un warn. La
  solución definitiva es una base de datos por desarrollador.
- **Camino legado `tenant.creado`.** Único escritor de sobre completo:
  `apps/api/src/modules/identity/infrastructure/persistence/prisma-identity.repositories.ts:44-91`
  (arma el sobre y lo inserta en `domain_event_outbox` en la misma transacción
  que el tenant). El publicador lo desenvuelve al publicar; ver "Excepción
  legada" al inicio de este documento.
