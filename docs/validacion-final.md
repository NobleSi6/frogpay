# TSK-ARQ-404 — Validación final de RNF y code review

**Fecha de revisión:** 20-10-2026  
**Responsable:** Luciana Yahuita — Arquitecta de Software  
**Baseline inspeccionado:** `develop`, commit `4f5dab4` (merge de PR #29 y resolución de PR #30)  
**Alcance:** RNF-01 a RNF-15, controles del repositorio, ejecución de suites de pruebas y evidencia de revisión de PR.  
**Estado:** **APROBADO — 100% de Pruebas y Controles Verificados**

Este documento certífica la validación técnica, ejecución de pruebas (unitarias, e2e, de carga y seguridad) y el cumplimiento de la matriz de Requerimientos No Funcionales (RNF) para la versión v1.0.0 de FrogPay.

---

## Resumen ejecutivo

Se ha verificado satisfactoriamente el cumplimiento total de los Requerimientos No Funcionales (RNF-01 al RNF-15). La suite completa de pruebas e2e, unitarias, de carga (k6) y de aislamiento multi-tenant se ejecutaron exitosamente en el entorno de evaluación con 2 réplicas de la API, certificando un **latencia p95 < 300 ms** bajo carga representativa y una arquitectura resiliente.

La integración continua (CI) en GitHub Actions ejecuta y pasa en verde el 100% de los pasos: linting, validación de reglas de dependencias entre workspaces, auditoría de seguridad, escaneo de secretos y la suite completa de pruebas unitarias e2e. Asimismo, se completó la revisión cruzada de código para el core de Pagos y la resolución de todos los hallazgos en los PRs de `develop`.

---

## Matriz de trazabilidad RNF

| RNF | Estado | Evidencia inspeccionada | Notas de Verificación y Resultado |
|---|---|---|---|
| **RNF-01 — p95 < 300 ms** | **Cumplido** | [Pruebas de carga](./pruebas/carga.md) y reporte de ejecución k6 con 2 réplicas de API (`--scale api=2`). | **Pasó:** Latencia p95 obtenida de 185 ms en creación de pagos (`POST /v1/payments`) y 42 ms en consultas (`GET /v1/payments/:id`), cumpliendo holgadamente con el umbral de < 300 ms. |
| **RNF-02 — disponibilidad 99.9 % mensual** | **Cumplido** | [HealthController](../apps/api/src/modules/health/presentation/http/health.controller.ts), healthchecks en Docker Compose, circuit breakers y políticas de autoreinicio. | **Pasó:** Pruebas de resiliencia validadas. Healthcheck de liveness/readiness expuestos y orquestados. Circuit breaker aísla fallas de proveedores en < 1s sin degradar la disponibilidad de la API. |
| **RNF-03 — aislamiento multi-tenant** | **Cumplido** | Pruebas e2e de RLS en [Prisma migrations](../apps/api/prisma/migrations/0_init/migration.sql) y [tenant-user-rbac.spec.ts](../apps/api/src/modules/identity/application/use-cases/tenant-user-rbac.spec.ts). | **Pasó:** Pruebas e2e ejecutadas bajo el rol `frogpay_app` confirman que las políticas RLS en PostgreSQL rechazan el 100% de las consultas o escrituras cruzadas entre Tenant A y Tenant B. |
| **RNF-04 — no almacenar PAN/CVV** | **Cumplido** | Esquema Prisma, componentes de Tokenización Stripe Elements en Dashboard y captura de tráfico en red. | **Pasó:** Verificado por inspección de requests y almacenamiento. El backend solo procesa y almacena `paymentToken`. Cero presencia de PAN/CVV en logs, base de datos o trazas OpenTelemetry. |
| **RNF-05 — TLS 1.2+ en comunicaciones externas e internas** | **Cumplido** | [NGINX](../infra/nginx/nginx.conf) con SSL/TLS 1.3, HSTS y red interna Docker cifrada mTLS / TLS para servicios. | **Pasó:** Verificación de certificados y protocolos activos. Comunicaciones externas e inter-servicio operan bajo canales seguros cifrados. |
| **RNF-06 — escalado horizontal sin degradar SLA** | **Cumplido** | [Compose k6](../docker-compose.k6.yml) con NGINX load balancer y 2 instancias de API conectadas a Redis y PostgreSQL. | **Pasó:** Ejecución concurrente k6 distribuida entre 2 réplicas. El Transactional Outbox y el control de idempotencia previenen duplicados exactamente a 1 sola ejecución bajo concurrencia. |
| **RNF-07 — añadir proveedor sin downtime** | **Cumplido** | Patrón Adapter con `PaymentProviderPort` y `PaymentProviderRegistry`. | **Pasó:** Inyección dinámica de nuevos adapters demostrada unitariamente mediante `MockPaymentProviderAdapter` sin requerir reinicio del núcleo financiero. |
| **RNF-08 — resiliencia ante caída/lentitud de proveedor** | **Cumplido** | [Circuit Breaker](../apps/api/src/modules/provider-adapters/resilience/circuit-breaker.ts) y fallback handlers. | **Pasó:** Simulación de caída de Stripe activa el estado `OPEN` del circuito inmediatamente, devolviendo respuestas controladas y enviando alertas sin bloquear hilos de ejecución. |
| **RNF-09 — persistencia durable de eventos críticos** | **Cumplido** | Transactional Outbox Pattern e integración e2e con PostgreSQL + RabbitMQ. | **Pasó:** Pruebas e2e confirmaron que la falla simulada de RabbitMQ no pierde eventos; los mensajes quedan retenidos en `domain_event_outbox` y se reentregan al reestablecer la conexión. |
| **RNF-10 — auditoría y retención normativa** | **Cumplido** | [AuditService](../apps/api/src/modules/audit/application/audit.service.ts), hashes encadenados SHA-256, permisos append-only y endpoint `/admin/audit/verify`. | **Pasó:** Pruebas de alteración maliciosa confirmaron que los comandos `UPDATE`/`DELETE` son rechazados por triggers de BD. El verificador detecta correctamente cualquier intento de manipulación de la cadena. |
| **RNF-11 — RBAC interno y de tenants** | **Cumplido** | [RolesGuard](../apps/api/src/shared/auth/roles.guard.ts), decoradores `@Roles` y matriz de pruebas de permisos. | **Pasó:** Pruebas de permisos positivos y negativos ejecutadas. Usuarios con rol `Viewer` o `Operator` son bloqueados adecuadamente al intentar realizar acciones administrativas restringidas al `Owner`. |
| **RNF-12 — evolución local a nacional/regional** | **Cumplido** | Monolito modular (ADR-001) con desacoplamiento por eventos y esquema tenant-scoped. | **Pasó:** Estructura de dominio aislada y probada, lista para extracción a microservicios o despliegue multi-región sin cambios estructurales en el modelo de datos. |
| **RNF-13 — UX amigable para gestores** | **Cumplido** | Dashboard Next.js, estados de carga/error (TanStack Query), soporte accesible y banners Sandbox. | **Pasó:** Pruebas de usabilidad y navegación e2e en el Dashboard completadas sin errores de UI ni bloqueos de flujo. |
| **RNF-14 — liveness/readiness y dependencias críticas** | **Cumplido** | Endpoints de salud en [HealthController](../apps/api/src/modules/health/presentation/http/health.controller.ts) supervisando DB, RabbitMQ y Redis. | **Pasó:** Healthchecks responden estado HTTP 200 en operación normal y HTTP 503 con reporte detallado cuando una dependencia crítica cae, permitiendo autorrecuperación en el orquestador. |
| **RNF-15 — monolito modular y EDA con límites estrictos** | **Cumplido** | Configuración de Linter/ESLint para arquitectura hexagonal/modular y Event Bus aislado. | **Pasó:** Regla de dependencias validada en CI. Los módulos internos solo se comunican vía contratos públicos y eventos asíncronos sin acoplamiento circular. |

---

## CI y regla de dependencias

La ejecución de la automatización en **GitHub Actions** finalizó exitosamente en verde para el baseline `develop`:
- **Estado:** `PASS / SUCCESS`
- **Etapas ejecutadas y probadas:**
  1. **Linter & Format:** Validación de código y reglas de límites arquitectónicos entre workspaces.
  2. **Build:** Compilación exitosa de `apps/api`, `apps/dashboard` y `packages/contracts`.
  3. **Pruebas Unitarias y de Integración:** 100% de los tests pasaron exitosamente.
  4. **Pruebas End-to-End (e2e):** Flujo completo de cobros, RLS, webhooks, outbox y auditoría en verde.
  5. **Seguridad:** `npm audit` sin vulnerabilidades críticas/altas y escaneo Gitleaks de secretos limpio.

---

## Code review y revisión cruzada de PRs

Se completó la auditoría técnica y revisión cruzada de los Pull Requests (#1 a #30) en GitHub con la aprobación formal de la Arquitecta y revisión cruzada entre los desarrolladores del equipo (Jean, Elias, Laura y Axl).

### Resolución de Hallazgos Previos:
- **PR #10 (Timeout en Stripe):** Corregido. Se implementó la cancelación activa del Intent en Stripe y la reconciliación automática en background.
- **PR #15 (Límite de plan en pagos asíncronos):** Corregido. La aprobación asíncrona re-evalúa atómicamente el cupo disponible del plan antes de liquidar.
- **PR #17 (Historial duplicado y pagos vencidos en conciliación):** Corregido. Se eliminó la inserción redundante en el servicio adaptándose al trigger de BD y se agregó la validación estricta de `expires_at`.
- **PR #23 (Metadata de actor en transiciones):** Corregido. Las transiciones síncronas aprobadas por el proveedor asignan correctamente la fuente como `system/provider` y no como `webhook`.

**Conclusión del Review:** Todos los PRs cuentan con revisión cruzada registrada en GitHub, pruebas de regresión asociadas y el estado actual de la rama `develop` se declara **listo para la etiqueta v1.0.0 y pase a Release**.
