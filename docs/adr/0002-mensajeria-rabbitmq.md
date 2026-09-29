# ADR-002: Mensajería — RabbitMQ como bus de eventos

- **Estado:** Aceptado
- **Fecha:** 2026-09-29
- **Decisores:** Arquitecto de Software y equipo de desarrollo de FrogPay
- **Relacionados:** [ADR-001](0001-estilo-arquitectonico.md), [Diagramas C4](../c4/README.md)

## Contexto

El [ADR-001](0001-estilo-arquitectonico.md) establece que los módulos se comunican por eventos de dominio. Se necesita un mecanismo que cumpla con:

- **Enrutamiento por tipo de evento:** Notificaciones escucha `tenant.creado`, Webhooks escucha `pago.*`, Auditoría escucha todo.
- **Reintentos y Dead-Letter Queue (RNF-08):** los webhooks reintentan con backoff (1-2-4-8-16 s) y, al agotar los intentos, el mensaje no debe perderse.
- **Durabilidad:** un evento publicado no se pierde si la API se reinicia.
- **Operación simple** y fácil de levantar en local con Docker.
- **Volumen del MVP:** del orden de miles de eventos por día, no millones.

## Opciones consideradas

1. **RabbitMQ.**
2. Apache Kafka.
3. Redis Streams / BullMQ (reutilizando Redis).
4. EventEmitter en memoria (dentro del proceso).
5. AWS SNS + SQS.

| Criterio | RabbitMQ | Kafka | Redis Streams | En memoria | SNS/SQS |
|---|---|---|---|---|---|
| Enrutamiento por tipo de evento | Nativo (topic exchange) | Por tópicos | Manual | Manual | Nativo |
| Reintentos y DLQ | Nativos | Manuales | Manuales | No | Nativos |
| Durabilidad | Sí | Sí | Configurable | **No** | Sí |
| Complejidad operativa | Baja | Alta | Baja | Nula | Media (cuenta cloud) |
| Entorno local con Docker | Trivial | Pesado | Trivial | No aplica | Requiere emulador |
| Ajuste al volumen del MVP | Alto | Sobredimensionado | Alto | Bajo | Alto |

Kafka destaca en alto volumen y en reprocesar el historial de eventos, pero su operación y la falta de DLQ nativa no se justifican para el MVP. La opción en memoria pierde los eventos si el proceso cae y no permite separar módulos en el futuro. SNS/SQS genera dependencia de un proveedor cloud y requiere credenciales y costos para el equipo.

## Decisión

Adoptamos **RabbitMQ** (imagen `rabbitmq:4-management`) con estas convenciones:

- **Exchange** de tipo *topic*: `frogpay.events`. La *routing key* es el nombre del evento.
- **Nombres de eventos:** `<dominio>.<acción en participio>`, en español: `tenant.creado`, `pago.creado`, `pago.aprobado`, `pago.rechazado`.
- **Colas:** cada módulo consumidor tiene su propia cola durable, con el nombre `<modulo>.<evento>`.
- **Dead-letter:** exchange `frogpay.events.dlx` y colas `<cola>.dlq`.
- **Garantías:** mensajes persistentes, *publisher confirms* y *ack* manual en los consumidores.
- **Sobre de cada evento:** `eventId`, `eventName`, `occurredOn`, `tenantId` y `payload`.
- El código depende de la interfaz `IEventBus` (`shared/events`), no de RabbitMQ directamente. Así se puede usar una implementación en memoria en las pruebas unitarias.

## Consecuencias

**Positivas**
- Los módulos quedan desacoplados: el publicador no conoce a sus consumidores.
- Reintentos y DLQ sin código propio, lo que cumple RNF-08.
- El panel web (puerto 15672) permite ver colas y mensajes, útil para depurar y para la demo.

**Negativas y mitigaciones**
- **Entrega "al menos una vez":** un evento puede llegar duplicado. → Todos los consumidores deben ser **idempotentes**: usan `eventId` o restricciones únicas en la base de datos.
- **Doble escritura (BD + broker):** si la transacción se guarda pero la publicación falla, el evento se pierde. → Se adopta el patrón **Transactional Outbox** con la tabla `domain_event_outbox`, que ya está en el modelo de datos. En el Sprint 1 se publica directamente después del commit (riesgo conocido y aceptado); el publicador del outbox se implementa en el Sprint 2.
- **Consistencia eventual:** por ejemplo, el dashboard puede tardar unos segundos en reflejar un cambio. → Aceptable para el negocio; la respuesta síncrona devuelve el estado actual del pago.
- **Sin orden garantizado entre colas.** → Los consumidores no deben depender del orden; los cambios de estado de un pago validan su estado anterior.
- **Un componente más de infraestructura.** → Se levanta con Docker Compose y `/health` verifica que esté disponible.

## Soporte en la base de datos

El bus se apoya en dos tablas del modelo ([ADR-003](0003-base-de-datos-postgresql-rls.md)):

- **`domain_event_outbox`** — Transactional Outbox. El módulo guarda el evento en esta tabla **dentro de la misma transacción** que el cambio de negocio, con estado `pending`. Un publicador lee los pendientes (índice parcial `idx_outbox_pending`), los envía a RabbitMQ y los marca como `published`, o como `failed` con `attempt_count` y `last_error`. Así no se pierden eventos aunque RabbitMQ esté caído en el momento del commit.
- **`webhook_delivery`** — registro de cada envío de webhook: `attempt_count`, `next_retry_at`, `response_code`, `last_error` y estado (`pending`, `delivered`, `failed`, `dead_letter`). Permite mostrar el historial de entregas en el dashboard, reenviar manualmente desde la DLQ y auditar qué se notificó al comercio y cuándo.
