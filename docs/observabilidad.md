# Contrato de observabilidad

> TSK-ARQ-402 / TSK-DEV2-401 / TSK-DEV2-402 — Sprint 4.
> Decisión propuesta: [ADR-011](adr/0011-observabilidad.md); requiere aprobación.

## Correlación de solicitudes y trazas

- La API acepta `X-Request-Id`; si no se envía, genera un UUID. El valor se
  conserva como `requestId` en logs estructurados y respuestas de error.
- Se propaga el contexto W3C Trace Context (`traceparent`, `tracestate`) por
  HTTP, outbox, headers AMQP, consumidores y llamada HTTP del webhook.
- El outbox debe persistir `correlation_id` (`requestId`) y `traceparent` para
  no perder contexto entre el commit y la publicación asíncrona. La migración y
  los cambios a `DomainEvent`/publicador están pendientes; ver
  [eventos.md](eventos.md).
- `trace_id` y `span_id` son campos de log hexadecimales según OpenTelemetry.
  Los trabajos periódicos sin request crean una traza raíz.

## Formato de logs

Un evento por línea JSON. Campos comunes:

```json
{
  "timestamp": "2026-10-16T10:15:00.000Z",
  "severity": "INFO",
  "service": "frogpay-api",
  "environment": "production",
  "message": "payment state changed",
  "requestId": "req_8a1c2e7d",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "tenantId": "9d4e1c2b-3a4f-5e6d-4a53-9d4e1c2b3a4f",
  "http": { "method": "GET", "route": "/api/v1/payments/:id", "status_code": 200 },
  "duration_ms": 24
}
```

Registrar `route` como plantilla (no el path con IDs). Nunca escribir PAN, CVC,
tokens, API Keys, secretos/ciphertext, cabeceras de autorización, firmas,
credenciales ni payloads completos. El middleware debe censurar valores antes
de serializar; las pruebas automáticas deben buscar estos patrones en logs.
`tenantId` se permite en logs de acceso restringido, pero no como etiqueta de
métrica.

## Métricas Prometheus

Endpoint: **`GET /metrics`**, formato Prometheus text exposition. Nombres
estables y etiquetas de cardinalidad acotada:

| Métrica | Tipo | Etiquetas | Uso |
|---|---|---|---|
| `frogpay_http_server_requests_total` | Counter | `method`, `route`, `status_code` | Solicitudes HTTP. |
| `frogpay_http_server_request_duration_seconds` | Histogram | `method`, `route` | Latencia por ruta; buckets deben incluir `0.3` segundos. |
| `frogpay_payments_total` | Counter | `status`, `method`, `environment` | Pagos creados por resultado y método. |
| `frogpay_provider_requests_total` | Counter | `provider`, `outcome` | Resultado de llamadas al adapter. |
| `frogpay_provider_circuit_breaker_state` | Gauge | `provider`, `state` | Un valor `1` para el estado actual; estados `closed`, `open`, `half_open`. |
| `frogpay_outbox_pending_events` | Gauge | — | Filas pendientes del outbox. |
| `frogpay_outbox_oldest_pending_age_seconds` | Gauge | — | Antigüedad de la fila pendiente más vieja. |
| `frogpay_webhook_deliveries` | Gauge | `status` | Entregas por estado (`pending`, `delivered`, `failed`). |
| `frogpay_rabbitmq_dlq_messages` | Gauge | `queue` | Mensajes en DLQ por cola. |

No usar `tenantId`, `requestId`, `paymentId`, URL ni mensaje de error como
etiquetas: su cardinalidad no está acotada y puede exponer datos. Las métricas
de negocio del dashboard son independientes; su contrato está en
[api/dashboard.md](api/dashboard.md).

## Reglas de alerta

| Alerta | Condición | Ventana/acción |
|---|---|---|
| `ApiHighP95Latency` | p95 de `frogpay_http_server_request_duration_seconds` > `0.3` s | Sostenido 5 min; notificar. |
| `ApiHigh5xxRate` | Respuestas 5xx > 5% del total | Sostenido 5 min; notificar. |
| `ProviderCircuitOpen` | Circuito de cualquier proveedor en `open` | 1 min; notificar. |
| `DeadLetterQueueNotEmpty` | `frogpay_rabbitmq_dlq_messages` > 0 | Inmediata; notificar. |
| `OutboxBacklogOld` | `frogpay_outbox_oldest_pending_age_seconds` > 300 s | Sostenido 5 min; notificar. |

Las alertas se entregan a Mailpit en desarrollo y al webhook/canal configurado
en producción. Grafana debe incluir paneles de latencia y errores, pagos por
estado/método y resiliencia (circuitos, outbox, DLQ y entregas de webhook).

## Traza de extremo a extremo

Para un pago se debe poder localizar una única traza desde el request HTTP,
pasando por la transacción que escribe el outbox, publicación RabbitMQ,
consumidor y envío de webhook. La prueba de aceptación recupera esos spans por
`trace_id` y permite buscar los logs relacionados por `requestId` sin que los
logs revelen secretos.