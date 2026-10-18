# ADR-012: Consulta y caché de métricas agregadas

- **Estado:** Propuesto
- **Fecha:** 2026-10-16
- **Decisores:** Luciana Yahuita y equipo de desarrollo FrogPay
- **Relacionados:** ADR-001, ADR-002, ADR-003, TSK-DEV3-403

## Contexto

El Dashboard requiere métricas por tenant, ambiente y rango de 7 o 30 días con
p95 menor a 300 ms (HU-08, RF-11). El rango se calcula en UTC, incluye el día
actual y se expresa con `from` inclusivo y `to` exclusivo. `dailySeries` debe
contener todos los días del rango, incluso aquellos sin actividad. El sandbox
no debe mezclarse con producción.

## Opciones consideradas

1. Consultar y agregar `payment` en cada request: mantiene una sola fuente de
   verdad y evita complejidad adicional; el índice compuesto y la caché
   permiten medir y controlar su rendimiento.
2. Guardar solo la respuesta en Redis: rápido, pero Redis no debe ser la fuente
   de verdad y un cache miss necesitaría consultar los pagos de todos modos.
3. Mantener un read model diario durable en PostgreSQL con caché Redis de corta
   duración: reduce el costo de las consultas repetidas, pero requiere
   sincronización, reconciliación y almacenamiento adicional.
4. Mover agregados a ClickHouse: adecuado para analítica a mayor escala, pero
   agrega operación y complejidad antes de que las métricas lo justifiquen.

## Decisión

1. Para el alcance inicial, `GET /dashboard/metrics` calcula los agregados
   directamente sobre `payment`, la fuente de verdad. La consulta filtra por
   `tenant_id`, `environment` y rango de `created_at`; se agrega el índice
   `(tenant_id, environment, created_at)` para soportarla.
2. El cálculo incluye los campos necesarios para el contrato de
   [dashboard.md](../api/dashboard.md): `status`, método de pago, monto,
   comisión y neto. Producción y sandbox se consultan por separado. Los montos
   se expresan en BOB para este alcance.
3. Redis se usa como caché *cache-aside* de la respuesta con TTL de 300
   segundos. La clave incluye versión del contrato, tenant, ambiente y rango;
   nunca se comparte entre tenants. La frescura máxima de una respuesta
   cacheada es cinco minutos.
4. Si Redis no está disponible, se consulta `payment` directamente. Redis no es
   fuente de verdad y su fallo no debe impedir el Dashboard.
5. Un read model diario queda como evolución, no como parte de este alcance.
   Se evaluará si la prueba de carga muestra que la consulta indexada y la
   caché no cumplen el p95 o si el volumen/retención analítica exige consultas
   históricas que PostgreSQL no pueda servir razonablemente. ClickHouse queda
   también como posible evolución.

## Consecuencias

**Positivas:** cálculo consistente con la fuente de verdad, menor complejidad
operativa inicial, aislamiento por tenant/ambiente y caché que acelera
solicitudes repetidas.

**Negativas y mitigaciones:** cada cache miss agrega sobre pagos y el costo de
la consulta crece con el volumen del rango. El índice compuesto y la prueba de
carga con caché fría y caliente validan el objetivo de latencia. La caché puede
devolver datos con hasta cinco minutos de antigüedad.

## Cumplimiento

- Pruebas verifican el cálculo de monto, comisión, neto, estado y método;
  aislamiento por tenant y separación por ambiente.
- `dailySeries` devuelve exactamente un elemento por día del intervalo y
  completa días sin actividad con ceros.
- Los agregados coinciden con un cálculo manual del seed para 7 y 30 días.
- Prueba de carga con 10.000 pagos verifica p95 menor a 300 ms en ambos
  escenarios: caché fría (cache miss) y caché caliente (cache hit).
- La clave de caché no comparte datos entre tenant/ambiente y la respuesta
  expira a los 300 segundos.
