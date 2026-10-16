# Contratos del Dashboard y administración

> TSK-ARQ-402 — Sprint 4. Los endpoints de esta página usan el prefijo global
> `/api`; las rutas se muestran sin ese prefijo. Los contratos nuevos son el
> objetivo de implementación, no una afirmación de que todas las rutas ya estén
> disponibles.

## Convenciones

- El Dashboard usa sesión JWT. Los endpoints de tenant derivan `tenantId` del
  JWT y nunca lo aceptan en body, query ni ruta.
- Los endpoints de tenant definidos en este contrato requieren rol `OWNER`.
  Las rutas `/admin/*` son exclusivas de `PLATFORM_ADMIN`.
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

`days` acepta `7` o `30`; `environment` acepta `production` o `sandbox` y es
obligatorio. Un cliente que presenta métricas reales debe solicitar
`production`; el sandbox nunca se mezcla con producción. La ventana usa fechas
UTC con `from` inclusivo y `to` exclusivo; `days=7` cubre los siete días
calendario completos anteriores a hoy. Para el MVP, `currency` siempre es
`BOB`. Respuesta:

```json
{
  "from": "2026-10-09",
  "to": "2026-10-16",
  "environment": "production",
  "currency": "BOB",
  "volume": "12500.00",
  "transactionCount": 42,
  "approvalRate": 0.9286,
  "commissionAmount": "437.50",
  "netAmount": "12062.50",
  "byMethod": [
    {
      "paymentMethod": "card",
      "transactionCount": 30,
      "approvedCount": 28,
      "volume": "9000.00"
    }
  ],
  "dailySeries": [
    {
      "date": "2026-10-15",
      "transactionCount": 8,
      "volume": "2100.00",
      "approvedCount": 7,
      "rejectedCount": 1,
      "failedCount": 0,
      "pendingCount": 0,
      "approvalRate": 0.875
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
| `dailySeries` | arreglo | Los mismos contadores e importes agrupados por día UTC de `created_at`; incluye `approvedCount`, `rejectedCount`, `failedCount`, `pendingCount` y tasa de aprobación diaria. |

Para la tasa, el denominador terminal incluye `approved`, `rejected`, `failed`,
`expired`, `refunded` y `partially_refunded`; `rejectedCount` cuenta solo el
estado `rejected`. `volume`, comisión y neto usan únicamente estados exitosos.
Los importes son cadenas decimales con dos posiciones; las tasas son números
JSON entre `0` y `1`. Si no hay actividad, los contadores e importes son cero y
la tasa es `0`.

Cachear la respuesta por 5 minutos, con clave que incluya tenant, rango y
ambiente ([ADR-012](../adr/0012-metricas-agregadas.md), propuesto), y mantener
aislamiento por tenant y ambiente. Los agregados deben concordar con el cálculo
manual sobre el seed y responder con p95 menor a 300 ms. Estas son métricas de
negocio; latencia HTTP, errores, circuitos, outbox y DLQ son métricas
operacionales de Prometheus y se especifican en
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

Verifica la cadena de hashes del tenant indicado y devuelve el resultado de la
verificación, la cantidad de registros revisados y el primer evento con ruptura
(si existe). Esta operación es independiente del listado `GET
/dashboard/audit-logs` y no modifica registros.

## Estado de plataforma

**`GET /admin/platform-status`** — solo `PLATFORM_ADMIN`.

```json
{
  "generatedAt": "2026-10-16T10:15:00.000Z",
  "dependencies": {
    "database": "up",
    "rabbitmq": "up",
    "redis": "up"
  },
  "providerCircuits": [
    { "provider": "stripe", "state": "closed" }
  ],
  "outbox": { "pending": 0, "oldestPendingAt": null },
  "deadLetterQueues": [{ "name": "frogpay.payments.dlq", "messages": 0 }],
  "grafanaUrl": "http://localhost:3002"
}
```

Solo salud operacional agregada: no incluir secretos, payloads, datos de pago
ni información de un tenant. Si Redis, RabbitMQ o PostgreSQL no puede
consultarse, indicar `degraded` para esa dependencia sin filtrar credenciales.

## Errores comunes

`400 validation_error` para filtros inválidos, 
`401 unauthorized` para sesión
ausente/inválida, 
`403 forbidden` para rol insuficiente, 
`404` para recurso
inexistente o ajeno, y 
`429 rate_limit_exceeded` cuando aplica. Ver
[errores.md](errores.md).