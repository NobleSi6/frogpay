# ADR-011: Observabilidad con OpenTelemetry y Grafana

- **Estado:** Propuesto
- **Fecha:** 2026-10-16
- **Decisores:** Luciana Yahuita y equipo de desarrollo FrogPay
- **Relacionados:** ADR-001, ADR-002, ADR-003, ADR-010, TSK-DEV2-401, TSK-DEV2-402

## Contexto

El equipo necesita detectar degradación y reconstruir el recorrido de una
operación a través de la API, el outbox, RabbitMQ y los webhooks (RNF-02,
RNF-14). Los logs aislados no bastan para correlacionar trabajo asíncrono; las
métricas deben permitir alertar sobre latencia, errores, proveedores, outbox y
DLQ. La solución debe ser operable en el monolito y en Docker Compose.

## Opciones consideradas

1. Logs locales y métricas ad hoc: bajo esfuerzo inicial, sin consultas
   centralizadas ni trazas distribuidas.
2. Plataforma comercial gestionada: reduce operación propia, pero introduce
   costo, dependencia externa y riesgo de enviar datos sensibles fuera del
   entorno.
3. Instrumentación OpenTelemetry con stack compatible Prometheus/Grafana:
   elegida para mantener formatos abiertos y operación local.

## Decisión

- Instrumentar la API y los componentes asíncronos con OpenTelemetry. Propagar
  W3C Trace Context por HTTP y AMQP y conservar `requestId` como correlación
  legible. El outbox debe persistir `correlation_id` y `traceparent`, porque la
  publicación ocurre después del request.
- Exponer métricas Prometheus en `GET /metrics`, restringido a la red interna;
  no debe ser un endpoint público. Usar etiquetas de cardinalidad acotada
  (`route`, `method`, `status_code`, `provider`, `outcome`, `environment`),
  nunca IDs de tenant, pago, request ni URLs concretas.
- Usar Grafana para dashboards y alertas, Prometheus para scraping y reglas,
  Alertmanager para notificaciones, Loki para logs JSON y Promtail como agente
  de recolección en el perfil local `observability`. Tempo recibe trazas OTLP.
  Los puertos de herramientas se exponen solo localmente; Grafana usa el puerto
  de host `3002` para no colisionar con el Dashboard en `3001`.
- Los logs incluyen timestamp, nivel, servicio, entorno, `requestId`,
  `trace_id`, `span_id` y, con acceso restringido, `tenantId`. Censurar PAN,
  CVC, tokens, API Keys, secretos, firmas y credenciales antes de serializar.
- Alertar por p95 > 300 ms sostenido, errores 5xx > 5%, circuito abierto, DLQ
  con mensajes y evento más antiguo del outbox > 300 s. Las ventanas y
  expresiones quedan versionadas con la configuración de Prometheus.

## Consecuencias

**Positivas:** trazas portables, dashboards y alertas reproducibles en local,
correlación entre etapas y menor riesgo de fuga al prohibir secretos y etiquetas
de alta cardinalidad.

**Negativas y mitigaciones:** el stack consume recursos y agrega configuración.
Se levanta solo con `docker compose --profile observability`; la API sigue
funcionando si el stack de observabilidad no está disponible. La migración y
propagación del contexto en outbox/RabbitMQ son trabajo de implementación
pendiente, no una capacidad existente.

## Cumplimiento

- Una traza de pago puede recuperarse desde API hasta consumidor y webhook por
  `trace_id`, y correlacionarse con logs mediante `requestId`.
- Pruebas automáticas verifican censura de secretos; no hay IDs no acotados
  como labels Prometheus.
- La prueba de caída de Stripe produce la alerta configurada; pruebas validan
  alertas de p95, 5xx, circuito, DLQ y antigüedad del outbox.
- `GET /metrics` no es accesible desde una red pública y las herramientas usan
  puertos locales documentados.