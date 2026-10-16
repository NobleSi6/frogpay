# ADR-012: Read model y caché para métricas agregadas

- **Estado:** Propuesto
- **Fecha:** 2026-10-16
- **Decisores:** Luciana Yahuita y equipo de desarrollo FrogPay
- **Relacionados:** ADR-001, ADR-002, ADR-003, TSK-DEV3-403

## Contexto

El Dashboard requiere métricas por tenant, ambiente y rango de 7 o 30 días con
p95 menor a 300 ms (HU-08, RF-11). Calcular cada petición escaneando pagos e
historial puede degradarse con el crecimiento; el sandbox además no debe
mezclarse con producción. Ya existe el modelo `daily_tenant_metrics` en
PostgreSQL, aunque sus campos deben ampliarse para representar todo el contrato
de [dashboard.md](../api/dashboard.md).

## Opciones consideradas

1. Consultar y agregar la tabla `payment` en cada request: simple y siempre
   actual, pero el costo aumenta con el volumen y complica el p95.
2. Guardar solo la respuesta en Redis: rápido, pero Redis no debe ser la fuente
   de verdad y una expiración/cache miss volvería a escanear pagos.
3. Read model diario en PostgreSQL con caché Redis de corta duración: elegido
   para el MVP; combina una consulta acotada, recuperación durable y latencia
   baja para lecturas repetidas.
4. Mover agregados a ClickHouse: adecuado para analítica a mayor escala, pero
   agrega operación y complejidad antes de que las métricas lo justifiquen.

## Decisión

1. `daily_tenant_metrics` es el read model durable y se actualiza a partir de
   eventos de pago procesados idempotentemente. Su clave lógica es
   `(tenant_id, date, environment)`, con RLS por tenant. Debe almacenar los
   conteos, importes de volumen/comisión/neto y desglose por método/estado
   necesarios para responder el contrato; el esquema actual es incompleto y
   requiere migración.
2. `GET /dashboard/metrics` agrega las filas del rango solicitado, sin consultar
   toda la tabla `payment`. Los importes del MVP se expresan en BOB. El rango es
   UTC, `from` inclusivo y `to` exclusivo; producción y sandbox se consultan
   por separado.
3. Redis se usa como caché *cache-aside* de la respuesta con TTL de 300 segundos.
   La clave incluye versión del contrato, tenant, ambiente y rango; nunca se
   comparte entre tenants. La frescura eventual máxima de una respuesta cacheada
   es cinco minutos.
4. Ante una indisponibilidad de Redis se consulta el read model directamente.
   Redis no es fuente de verdad y su fallo no debe impedir el Dashboard.
5. ClickHouse queda como evolución, no como dependencia del MVP. Evaluarlo si
   las pruebas de carga muestran que el read model optimizado y el cache no
   cumplen p95 o si el volumen/retención analítica exige consultas históricas
   que PostgreSQL no pueda servir razonablemente.

## Consecuencias

**Positivas:** latencia acotada, consultas aisladas por tenant/ambiente,
recuperación sin Redis y camino incremental hacia un almacén analítico.

**Negativas y mitigaciones:** el read model es eventualmente consistente y
necesita reconciliación. La deduplicación del consumidor evita doble conteo;
una tarea de verificación compara agregados con el cálculo sobre pagos semilla.
El TTL permite hasta cinco minutos de antigüedad en caché. El esquema actual no
contiene todos los agregados de la decisión y debe migrarse antes de cerrar la
tarea.

## Cumplimiento

- Pruebas unitarias y de integración verifican cálculo, aislamiento RLS,
  idempotencia de eventos, separación por ambiente y fallback sin Redis.
- Los agregados coinciden con un cálculo manual del seed para 7 y 30 días.
- Prueba de carga con 10.000 pagos verifica p95 menor a 300 ms.
- La caché no sirve datos de otro tenant/ambiente y expira a los 300 segundos.