# Auditoría, integridad y retención

Los cambios de estado de pagos y las operaciones sensibles se escriben en `audit_log`. Cada fila incluye tenant, entidad, acción, actor, ambiente, fecha, estado anterior/nuevo y una cadena SHA-256 (`previous_hash` + `record_hash`). PostgreSQL bloquea `UPDATE`, `DELETE` y `TRUNCATE`; la verificación reporta el primer evento alterado.

La consulta del owner está aislada mediante RLS y no expone hashes internos ni secretos. Las claves con nombres sensibles se reemplazan por `[REDACTED]` antes de persistir.

La retención por defecto es de cinco años (`AUDIT_RETENTION_YEARS`). En este sprint la variable documenta la política: **no existe borrado automático**, para preservar la inmutabilidad. Cuando se implemente archivado deberá exportar y verificar la cadena antes de retirar particiones completas mediante una cuenta administrativa controlada; nunca mediante la API de aplicación.
