# Architecture Decision Records (ADRs)

Registro de las decisiones de arquitectura importantes de FrogPay: qué se decidió, por qué y qué consecuencias tiene.

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](0001-estilo-arquitectonico.md) | Estilo arquitectónico: Monolito Modular Orientado a Eventos | Aceptado |
| [ADR-002](0002-mensajeria-rabbitmq.md) | Mensajería: RabbitMQ como bus de eventos | Aceptado |
| [ADR-003](0003-base-de-datos-postgresql-rls.md) | Base de datos: PostgreSQL en Supabase con esquema compartido y RLS | Aceptado |
| [ADR-009](0009-conciliacion-bancaria.md) | Conciliación bancaria automática | Aceptado |
| [ADR-010](0010-auditoria-inmutable.md) | Auditoría append-only con hash encadenado | Propuesto |
| [ADR-011](0011-observabilidad.md) | Observabilidad con OpenTelemetry y Grafana | Propuesto |
| [ADR-012](0012-metricas-agregadas.md) | Read model y caché para métricas agregadas | Propuesto |

## Cómo proponer un nuevo ADR

1. Copiar `0000-plantilla.md` con el siguiente número consecutivo disponible
	(actualmente `0013-titulo-corto.md`).
2. Completarlo con estado **Propuesto** y abrir un PR hacia `develop`.
3. Cuando el equipo lo aprueba en el PR, cambiar el estado a **Aceptado** y agregarlo a esta tabla.
4. Un ADR aceptado no se edita: si la decisión cambia, se crea uno nuevo que lo **reemplaza**, y el anterior pasa a estado *Reemplazado por ADR-XXX*.
