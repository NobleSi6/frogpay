# ADR-010: Auditoría inmutable con hash encadenado

- **Estado:** Aprobado
- **Fecha:** 2026-10-16
- **Decisores:** Luciana Yahuita y equipo de desarrollo FrogPay
- **Relacionados:** ADR-001, ADR-002, ADR-003, TSK-DEV3-401, TSK-DEV3-402

## Contexto

FrogPay debe conservar trazabilidad de operaciones financieras y sensibles
(RF-13, RNF-10). El registro debe ser consultable por tenant, idempotente ante
la entrega *at-least-once* de RabbitMQ y resistente a modificaciones
accidentales desde la aplicación. La tabla `audit_log` actual aún no implementa
todos los campos ni las protecciones de esta decisión.

## Opciones consideradas

1. Usar solamente logs de aplicación: son operacionales y rotables, no una
   fuente durable de auditoría financiera.
2. Guardar eventos en una tabla mutable: facilita correcciones, pero no permite
   detectar alteraciones o borrados posteriores.
3. Tabla append-only con RLS, deduplicación y hash por tenant: elegida para el
   MVP, con exportación futura a almacenamiento con Object Lock.

## Decisión

La fuente de verdad de auditoría será una tabla PostgreSQL append-only en el
esquema compartido, protegida por RLS. Cada fila tendrá, como mínimo:
`event_id` único, `tenant_id`, entidad y su ID, acción, estado anterior y nuevo,
actor, `request_id`, ambiente, fecha UTC, `previous_hash` y `record_hash`.

1. El consumidor de Auditoría procesa `pago.creado`, `pago.aprobado`,
   `pago.rechazado` y eventos acordados de operaciones sensibles. Nunca guarda
   PAN, CVC, secretos, API Keys en claro, ciphertext ni cuerpos completos de
   credenciales.
2. `event_id` es único. La inserción del registro y la deduplicación del evento
   se confirman en una transacción; los duplicados no producen otra fila.
3. `record_hash` es SHA-256 de una serialización canónica/versionada del
   registro y `previous_hash`. Cada tenant inicia una cadena independiente.
   La escritura serializa la asignación del hash por tenant dentro de la
   transacción para evitar bifurcaciones concurrentes.
4. El rol `frogpay_app` tendrá `SELECT` e `INSERT`, nunca `UPDATE` ni `DELETE`.
   Un trigger de base de datos rechaza ambas operaciones incluso si se cambia
   accidentalmente el permiso del rol. Las migraciones las ejecuta el rol de
   migración, no el rol de runtime.
5. El registro se conserva por un mínimo de cinco años por defecto
   (`AUDIT_RETENTION_YEARS`), sujeto a validación normativa. La aplicación no
   elimina filas. La política de archivo/expurgo posterior requiere revisión
   legal y operativa.
6. Una verificación recalcula la cadena y reporta la primera ruptura. La
   evolución prevista es exportar snapshots firmados a almacenamiento con
   Object Lock; el hash en PostgreSQL por sí solo no protege frente a un
   administrador de base de datos malicioso que pueda reescribir toda la
   cadena.

## Consecuencias

**Positivas:** trazabilidad durable, aislamiento por RLS, deduplicación
explícita y detección de modificaciones, junto con una ruta de fortalecimiento
externo.

**Negativas y mitigaciones:** el encadenamiento serializa escrituras por tenant
y añade trabajo de verificación. Mantener la transacción breve, indexar por
`(tenant_id, created_at)` y medir su impacto. La aplicación necesita una
migración aditiva; el `audit_log` actual no cumple todavía esta decisión.

## Cumplimiento

- Pruebas de integración demuestran que cada transición produce una fila y un
  evento repetido no duplica el registro.
- Como `frogpay_app`, `UPDATE` y `DELETE` fallan; también falla una escritura
  cruzada entre tenants por RLS.
- Una modificación controlada en una base de prueba es detectada por la
  verificación; pruebas concurrentes no bifurcan la cadena.
- Logs, payloads y exportaciones se revisan para descartar secretos y datos de
  tarjeta.