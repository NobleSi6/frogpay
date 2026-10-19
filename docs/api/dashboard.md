# Contratos del Dashboard y administración

> TSK-ARQ-402 — Sprint 4. Los endpoints de esta página usan el prefijo global
> `/api`; las rutas se muestran sin ese prefijo. Los contratos nuevos son el
> objetivo de implementación, no una afirmación de que todas las rutas ya estén
> disponibles.

## Convenciones

- El Dashboard usa sesión JWT. Los endpoints de tenant derivan `tenantId` del
  JWT y nunca lo aceptan en body, query ni ruta.
- Los endpoints de tenant definidos en este contrato requieren rol `OWNER`.
  Las rutas `/admin/*` requieren `PLATFORM_ADMIN`, excepto
  `/admin/platform-status`, que también admite el rol de solo lectura
  `PLATFORM_OBSERVER`.
- Fechas de entrada/salida en ISO 8601 UTC; montos como cadenas decimales.
- La paginación comienza en `page=1`, `limit=25`; `limit` máximo `100`.
- Colecciones responden `{ "data": [], "page": 1, "limit": 25,
  "total": 0, "totalPages": 0 }`.

## Listado de transacciones

**`GET /dashboard/payments`** — `OWNER`.

Query params combinables:

| Parámetro | Tipo | Regla |
|---|---|---|
| `page`, `limit` | entero | Paginación de servidor; `limit` máximo 100. |
| `status` | texto | Estado exacto: `pending`, `approved`, `rejected`, `failed`, `expired`, `refunded` o `partially_refunded`. |
| `from`, `to` | fecha ISO-8601 | Rango sobre `createdAt`; `from` inclusivo y `to` exclusivo. |
| `paymentMethod` | texto | Método: por ejemplo `card`, `qr` o `bank_transfer`. |
| `environment` | texto | `sandbox` o `production`. |
| `search` | texto | Búsqueda por referencia del comercio o prefijo del UUID del pago. |
| `sortBy` | texto | `createdAt`, `amount` o `status`; por defecto `createdAt`. |
| `sortOrder` | texto | `asc` o `desc`; por defecto `desc`. |

Cada elemento contiene los campos de pago de [pagos.md](pagos.md), sin historial.
La respuesta nunca incluye pagos de otro tenant. El backend debe agregar índices
para `(tenant_id, created_at)` y `(tenant_id, status)` y verificar p95 menor a
300 ms con 10.000 pagos semilla.

## Detalle de transacción

**`GET /dashboard/payments/:id`** — `OWNER`.

Devuelve el contrato `PaymentDetailsResponseDto` de [pagos.md](pagos.md) y
`webhookDeliveries`, ordenadas de más recientes a más antiguas:

```json
{
  "webhookDeliveries": [
    {
      "id": "f7e9fbaa-ef25-4a1e-9e88-c9f55a4bf5c4",
      "webhookId": "cd88e9d8-7eec-4cca-a142-3946e19980ef",
      "status": "delivered",
      "attemptCount": 1,
      "lastAttemptAt": "2026-10-16T10:15:00.000Z",
      "nextAttemptAt": null,
      "createdAt": "2026-10-16T10:14:58.000Z"
    }
  ]
}
```

La respuesta no incluye URL de destino, firmas, secretos ni cuerpos con datos
sensibles. Un pago ajeno o inexistente responde `404`.

## Métricas del tenant

**`GET /dashboard/metrics?days=7&environment=production`** — `OWNER`.

`days` acepta `6` o `30`; `environment` acepta `production` o `sandbox` y es
obligatorio. Un cliente que presenta métricas reales debe solicitar
`production`; el sandbox nunca se mezcla con producción. La ventana usa fechas
UTC, incluye el día actual y empieza `days - 1` días antes. `from` es inclusivo
y `to` exclusivo, por lo que `to` corresponde al día siguiente al actual.
`dailySeries` contiene exactamente un elemento por cada día del intervalo,
ordenados de más antiguo a más reciente; los días sin actividad se completan
con contadores e importes en cero. Para el MVP, `currency` siempre es `BOB`.
Respuesta de ejemplo para `days=7`:

```json
{
  "from": "2026-10-10",
  "to": "2026-10-16",
  "environment": "production",
  "currency": "BOB",
  "volume": "2100.00",
  "transactionCount": 8,
  "approvalRate": 0.875,
  "commissionAmount": "73.50",
  "netAmount": "2026.50",
  "byMethod": [
    {
      "paymentMethod": "card",
      "transactionCount": 8,
      "approvedCount": 7,
      "volume": "2100.00"
    }
  ],
  "dailySeries": [
    {
      "date": "2026-10-10",
      "transactionCount": 0,
      "volume": "0.00",
      "approvedCount": 0,
      "rejectedCount": 0,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0
    },
    {
      "date": "2026-10-11",
      "transactionCount": 0,
      "volume": "0.00",
      "approvedCount": 0,
      "rejectedCount": 0,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0
    },
    {
      "date": "2026-10-12",
      "transactionCount": 0,
      "volume": "0.00",
      "approvedCount": 0,
      "rejectedCount": 0,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0
    },
    {
      "date": "2026-10-13",
      "transactionCount": 0,
      "volume": "0.00",
      "approvedCount": 0,
      "rejectedCount": 0,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0
    },
    {
      "date": "2026-10-14",
      "transactionCount": 0,
      "volume": "0.00",
      "approvedCount": 0,
      "rejectedCount": 0,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0
    },
    {
      "date": "2026-10-15",
      "transactionCount": 8,
      "volume": "2100.00",
      "approvedCount": 7,
      "rejectedCount": 1,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0.875
    },
    {
      "date": "2026-10-16",
      "transactionCount": 0,
      "volume": "0.00",
      "approvedCount": 0,
      "rejectedCount": 0,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0
    }
  ],
  "generatedAt": "2026-10-16T10:15:00.000Z"
}
```

### Definición de los indicadores

| Campo | Tipo | Definición |
|---|---|---|
| `transactionCount` | entero | Todos los pagos creados en la ventana, sin importar su estado actual. |
| `volume` | decimal como string | Volumen bruto de pagos exitosos: suma de `amount` cuyo estado actual sea `approved`, `refunded` o `partially_refunded`. No resta reembolsos. |
| `commissionAmount`, `netAmount` | decimal como string | Suma de `commission_amount` y `net_amount` de esos mismos pagos exitosos. |
| `approvalRate` | decimal entre 0 y 1 | Pagos exitosos (`approved`, `refunded`, `partially_refunded`) dividido entre pagos con resultado terminal. Excluye `pending`; si no hay resultados terminales, vale `0`. |
| `byMethod` | arreglo | Agregados por método: intentos creados, pagos exitosos y volumen bruto exitoso. |
| `dailySeries` | arreglo | Exactamente un objeto por cada día UTC del rango, también para días sin pagos; incluye `approvedCount`, `rejectedCount`, `failedCount`, `pendingCount` y tasa de aprobación diaria. |

Para la tasa, el denominador terminal incluye `approved`, `rejected`, `failed`,
`expired`, `refunded` y `partially_refunded`; `rejectedCount` cuenta solo el
estado `rejected`. `volume`, comisión y neto usan únicamente estados exitosos.
Los importes son cadenas decimales con dos posiciones; las tasas son números
JSON entre `0` y `1`. Si no hay actividad, los contadores e importes son cero y
la tasa es `0`.

Cachear la respuesta por 5 minutos, con clave que incluya tenant, rango y
ambiente ([ADR-012](../adr/0012-metricas-agregadas.md), propuesto), y mantener
aislamiento por tenant y ambiente. Los agregados deben concordar con el cálculo
manual sobre el seed y responder con p95 menor a 300 ms tanto con caché fría
como caliente. Estas son métricas de negocio; latencia HTTP, errores, circuitos,
outbox y DLQ son métricas operacionales de Prometheus y se especifican en
[observabilidad.md](../observabilidad.md).

## Auditoría del tenant

**`GET /dashboard/audit-logs`** — `OWNER`.

Filtros: `page`, `limit`, `paymentId`, `action`, `from` y `to`; `from` es
inclusivo y `to` exclusivo. Orden descendente por fecha. Respuesta paginada con
`eventId`, `entity`, `entityId`, `action`, `previousState`, `newState`, `actor`,
`requestId`, `environment` y `createdAt`. No devolver hashes o metadatos que
expongan secretos. Este endpoint solo lista registros; no verifica la cadena.

## Verificación de auditoría

**`GET /admin/audit/verify?tenantId=<uuid>`** — solo `PLATFORM_ADMIN`.

Verifica la cadena de hashes del tenant indicado y no modifica registros. Una
cadena íntegra o rota es un resultado de verificación normal y responde `200`;
si hay una ruptura, `firstBrokenEventId` y `firstBrokenAt` identifican el primer
evento afectado. Si no hay ruptura, ambos campos son `null`.

```json
{
  "tenantId": "9d4e1c2b-3a4f-5e6d-4a53-9d4e1c2b3a4f",
  "valid": true,
  "recordsChecked": 128,
  "firstBrokenEventId": null,
  "firstBrokenAt": null,
  "verifiedAt": "2026-10-16T10:15:00.000Z"
}
```

Errores: `400 validation_error` si `tenantId` falta o no es un UUID válido;
`401 unauthorized` si falta o no es válida la sesión; `403 forbidden` si el
rol no es `PLATFORM_ADMIN`; `404 not_found` si el tenant no existe; y
`503 audit_verification_unavailable` si no se pudo completar la verificación.
Los errores usan el formato estándar `{ code, message, details, requestId }`.
Esta operación es independiente del listado
`GET /dashboard/audit-logs`.

## Estado de plataforma

**`GET /admin/platform-status`** — `PLATFORM_ADMIN` o `PLATFORM_OBSERVER`
(rol de plataforma limitado, de solo lectura).

Devuelve `200 OK` incluso cuando una o más dependencias estén degradadas o
caídas: el estado reportado describe salud operacional, no disponibilidad HTTP
del endpoint. `status` global es `operational` si todo está operativo,
`degraded` si algún componente tiene fallos parciales o `down` si un componente
crítico está caído. Cada dependencia informa su estado y latencia de la última
comprobación; los circuitos reportan el porcentaje de fallos (valor entre 0 y
100) y hora del último cambio. Los contadores de outbox, DLQ y entregas
fallidas de webhook son agregados entre tenants. El rol `PLATFORM_OBSERVER`
solo permite consultar este resumen: no puede acceder a datos de tenant,
inspeccionar payloads ni ejecutar acciones administrativas. No se devuelven
identificadores ni desglose por tenant.

```json
{
  "generatedAt": "2026-10-16T10:15:00.000Z",
  "status": "degraded",
  "dependencies": [
    { "name": "database", "status": "operational", "latencyMs": 12 },
    { "name": "rabbitmq", "status": "degraded", "latencyMs": 240 },
    { "name": "redis", "status": "operational", "latencyMs": 4 }
  ],
  "providerCircuits": [
    {
      "provider": "stripe",
      "state": "closed",
      "failurePercentage": 4.0,
      "lastChangedAt": "2026-10-16T09:50:00.000Z"
    }
  ],
  "outbox": { "pending": 3, "oldestPendingAt": "2026-10-16T10:12:00.000Z" },
  "deadLetterQueues": {
    "payments": { "messages": 2 },
    "webhooks": { "messages": 1 }
  },
  "webhookDeliveries": { "failed": 4 }
}
```

Los estados de dependencia usan `operational`, `degraded` o `down`. Una
dependencia sin respuesta se marca `down` y su `latencyMs` es `null`; errores
parciales se marcan `degraded`. Si no se puede obtener el estado de un
componente, la API sigue respondiendo `200` e informa su estado como `down`.
Solo se exponen conteos agregados: no incluir secretos, credenciales, payloads,
datos de pago, `tenantId` ni conteos separados por tenant.

## Errores comunes

`400 validation_error` para filtros inválidos,
`401 unauthorized` para sesión
ausente/inválida,
`403 forbidden` para rol insuficiente,
`404` para recurso
inexistente o ajeno, y
`429 rate_limit_exceeded` cuando aplica. Ver
[errores.md](errores.md).
