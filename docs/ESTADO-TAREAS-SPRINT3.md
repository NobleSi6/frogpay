# Estado de tareas: Sprint 3 y transferencia bancaria

**Actualizado:** 2026-10-13
**Rama:** `feature/jean-sprint3`
**Alcance:** integración backend, migración, validación y prueba de latencia.

## Trabajo completado

| Tarea | Estado | Resultado |
|---|---|---|
| Integración de `feature/axl-sprint3` | Completada | Integrada en `feature/jean-sprint3` mediante el commit `cb0b443`. |
| Migración `20261011000000_bank_transfer_reconciliation` | Aplicada en sandbox | Se confirmó la disponibilidad de `bank_transaction` y del flujo de conciliación. No usar esta confirmación como autorización para migrar producción. |
| TSK-ARQ-307: contrato API, simulador y catálogo de errores | Completada | Se encuentran implementados el contrato y los códigos de error relacionados. |
| TSK-BANK-301: adapter local de transferencia | Completada | Genera instrucciones bancarias y una referencia para el pago. |
| TSK-BANK-302: conciliación bancaria | Completada | Maneja coincidencia exacta, discrepancia de monto, referencia inexistente y transición de estado inválida. |
| TSK-BANK-303: simuladores bancarios | Completada | Endpoints para recibir depósitos simulados y simular conciliación desde el Dashboard. |
| TSK-BANK-304: listado BFF de transacciones | Completada | Listado paginado con filtros de estado y fecha para el tenant autenticado. |
| TSK-SCRUM-305: receptor de webhooks | Completada | Script de pruebas disponible en `scripts/webhook-receiver.js`. |
| Generación de Prisma Client | Completada | Ejecutada con Prisma sobre el schema de la API. |
| Build de API | Completado | `npm run build -w apps/api` finalizó correctamente tras los cambios de conciliación. |
| Pruebas de API y dashboard | Completadas | En la ejecución completa anterior: API, 54 suites/272 pruebas aprobadas y 7 omitidas; dashboard, 14 pruebas aprobadas. En la validación final del cambio de respuesta de conciliación, el build pasó y el spec del controlador aprobó 6/6. |
| Prueba funcional k6 | Parcial | El flujo de creación y conciliación pasó las comprobaciones funcionales; la latencia no alcanzó el objetivo de TSK-ARQ-308. |

## Pendiente

### TSK-ARQ-308: latencia k6 y revisión

La ejecución final fue de 30 segundos y 1 VU. Completó 2 iteraciones (4
solicitudes HTTP). Las comprobaciones funcionales fueron 10/10 y no hubo
solicitudes HTTP fallidas, pero el umbral de latencia no pasó:

| Métrica | Resultado | Criterio | Estado |
|---|---:|---:|---|
| Latencia p95 | 11,11 s | `< 2.500 ms` | No aprobado |
| Checks funcionales | 100% (10/10) | `> 99%` | Aprobado |
| Solicitudes fallidas | 0% | `< 1%` | Aprobado |

Queda pendiente investigar y reducir la latencia observada con Supabase,
repetir la medición con una muestra adecuada y completar la revisión de código
coordinada con Laura. No marcar esta tarea como terminada solo porque el flujo
funcional haya pasado.

## Trabajo de otros responsables

Según el tablero compartido en la conversación, siguen asignadas a otros
responsables:

- Frontend: TSK-DEV1-304, TSK-DEV1-305 y TSK-DEV1-306 (Luciana Yahuita).
- Scrum: TSK-SCRUM-301, TSK-SCRUM-302, TSK-SCRUM-304 y TSK-SCRUM-306.

Confirmar estos estados con el tablero vigente antes de cerrar el sprint; no
son evidencia de tareas backend pendientes del autor de esta rama.

## Cambios entregados en la rama

- `cb0b443`: integración de la migración de `axl-sprint3`.
- `ba6f1d5`: soporte del escenario k6, mapeo del catálogo bancario y respuesta
  HTTP `200` del endpoint de simulación de depósito conforme al contrato.

La prueba k6 usa el tenant sandbox creado para la ejecución y dejó cuatro
pagos y cuatro transacciones de prueba en Supabase sandbox. Las llaves
temporales quedaron revocadas; no había llaves temporales activas al verificar.
Los registros de prueba no se eliminaron.

La clave secreta de Stripe de prueba que se compartió en la conversación debe
rotarse, pues debe tratarse como expuesta. No se utilizó durante la prueba.
