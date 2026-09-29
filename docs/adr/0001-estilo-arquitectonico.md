# ADR-001: Estilo arquitectónico — Monolito Modular Orientado a Eventos

- **Estado:** Aceptado
- **Fecha:** 2026-09-29
- **Decisores:** Arquitecto de Software y equipo de desarrollo de FrogPay
- **Relacionados:** [ADR-002](0002-mensajeria-rabbitmq.md), [ADR-003](0003-base-de-datos-postgresql-rls.md), [Diagramas C4](../c4/README.md)

## Contexto

FrogPay es una pasarela de pago SaaS multi-tenant que debe integrar varios proveedores (tarjetas vía Stripe y QR interoperable BCB), notificar cambios de estado por webhooks y ofrecer un dashboard. El MVP se construye en 4 sprints con un equipo de 6 personas (2 back, 2 front, Arquitecto y Scrum Master), sin un equipo de operaciones dedicado.

Fuerzas que guían la decisión:

- **RNF-01:** la creación de un pago debe responder en menos de 300 ms, así que las tareas lentas no pueden bloquear la respuesta.
- **RNF-07 / RF-16:** agregar un proveedor de pago nuevo sin modificar el núcleo.
- **RNF-08:** tolerar fallos de proveedores y de webhooks sin perder información.
- **Restricciones del equipo:** 4 sprints, poca experiencia operando sistemas distribuidos.
- **Evolución:** si el volumen crece, poder separar partes del sistema sin reescribirlo.

## Opciones consideradas

1. Monolito tradicional en capas.
2. Microservicios desde el inicio.
3. **Monolito modular orientado a eventos.**
4. Serverless (una función por endpoint).

| Criterio | Capas | Microservicios | Modular + EDA | Serverless |
|---|---|---|---|---|
| Complejidad operativa | Baja | Muy alta | Baja | Media |
| Desacoplamiento entre dominios | Bajo | Alto | Alto | Medio |
| Ajuste al equipo y a 4 sprints | Alto | Bajo | Alto | Medio |
| Latencia de la respuesta síncrona | Buena | Peor (saltos de red) | Buena | Variable (cold start) |
| Camino de evolución | Difícil | Ya distribuido | Extraer un módulo = un servicio | Fragmentado |
| Pruebas y entorno local | Fácil | Difícil | Fácil | Difícil |

## Decisión

Adoptamos la **opción 3: Monolito Modular Orientado a Eventos**.

- Una sola aplicación NestJS desplegable (`apps/api`), dividida en módulos por dominio: `identity`, `plans`, `payments`, `provider-adapters`, `webhooks`, `notifications`, `audit` y `health`.
- Cada módulo se organiza en capas `domain → application → infrastructure → presentation`, y `domain` no depende de frameworks.
- Los módulos se comunican **por eventos de dominio** publicados en RabbitMQ ([ADR-002](0002-mensajeria-rabbitmq.md)).
- Solo se permite una llamada síncrona entre módulos cuando la respuesta es imprescindible para continuar (por ejemplo, Pagos consulta el límite restante en Planes), y siempre a través de un servicio que el módulo **exporta explícitamente**.
- Los proveedores de pago se integran con **Adapter + Strategy** detrás de `PaymentProviderPort`.

## Consecuencias

**Positivas**
- Un solo despliegue, un solo pipeline de CI y un entorno local simple con Docker Compose.
- Las transacciones dentro de un módulo son locales, sin transacciones distribuidas.
- Las tareas lentas (webhooks, correos, auditoría) salen de la respuesta HTTP, lo que ayuda a cumplir RNF-01.
- Como los módulos ya se comunican por eventos, cualquiera puede extraerse como microservicio moviendo sus consumidores a otro proceso.

**Negativas y mitigaciones**
- **Exige disciplina:** técnicamente nada impide importar el código interno de otro módulo. → Reglas documentadas en `apps/api/README.md`, revisión de cada PR por el Arquitecto y verificación automática de dependencias (dependency-cruiser) planificada para el Sprint 2.
- **Un fallo grave del proceso afecta a todos los módulos.** → `/health` para detectarlo, reinicio automático del contenedor, y timeout y circuit breaker en los adaptadores.
- **Escala en bloque.** → Aceptable para el volumen del MVP; los módulos se extraerán cuando las métricas lo justifiquen.
- **Consistencia eventual entre módulos.** → Ver [ADR-002](0002-mensajeria-rabbitmq.md).

## Cumplimiento

- La estructura de carpetas y las reglas de dependencia están en `apps/api/README.md`.
- La revisión de PR verifica que ningún módulo importe `domain/` o `infrastructure/` de otro módulo.
