# Architecture Decision Records (ADRs)

Registro de las decisiones de arquitectura importantes de FrogPay: qué se decidió, por qué y qué consecuencias tiene.

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](0001-estilo-arquitectonico.md) | Estilo arquitectónico: Monolito Modular Orientado a Eventos | Aceptado |
| [ADR-002](0002-mensajeria-rabbitmq.md) | Mensajería: RabbitMQ como bus de eventos | Aceptado |
| [ADR-003](0003-base-de-datos-postgresql-rls.md) | Base de datos: PostgreSQL en Supabase con esquema compartido y RLS | Aceptado |

## Cómo proponer un nuevo ADR

1. Copiar `0000-plantilla.md` con el siguiente número: `0004-titulo-corto.md`.
2. Completarlo con estado **Propuesto** y abrir un PR hacia `develop`.
3. Cuando el equipo lo aprueba en el PR, cambiar el estado a **Aceptado** y agregarlo a esta tabla.
4. Un ADR aceptado no se edita: si la decisión cambia, se crea uno nuevo que lo **reemplaza**, y el anterior pasa a estado *Reemplazado por ADR-XXX*.
