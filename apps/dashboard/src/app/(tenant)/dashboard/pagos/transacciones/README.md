# Pantalla «Transacciones»

Listado paginado de pagos del tenant en `/dashboard/pagos/transacciones`.

- **Contrato:** `GET /dashboard/payments` con la sesión JWT del Owner (el `tenantId` nunca se envía).
- **Capa de datos única:** `src/lib/api/payments.ts` exporta los tipos (`Payment`,
  `PaymentListParams`, `PaymentListResponse`, `ApiError`), `listPayments(params)` y el hook
  `usePaymentsList(params)`. Los componentes solo usan el hook; ningún componente hace `fetch`.
- **Estado en la URL:** filtros, página, tamaño de página y orden viven en el query string, así
  el enlace se puede compartir y el estado se conserva al volver desde el detalle.

## Alternar entre datos simulados y backend real

La fuente de datos la decide **una única variable**: `NEXT_PUBLIC_USE_MOCKS`.

| Valor | Comportamiento |
|---|---|
| `NEXT_PUBLIC_USE_MOCKS=true` (y build de desarrollo) | Simulador local: 120 pagos deterministas con la misma semántica del contrato. |
| Sin definir, cualquier otro valor, o build de producción | Llamada real a `GET /dashboard/payments` con el cliente HTTP existente. |

Para desarrollo:

```bash
# apps/dashboard/.env (o copia de apps/dashboard/.env.example)
NEXT_PUBLIC_USE_MOCKS=true
```

Para conectar el backend real **solo** cambia la variable:

```bash
NEXT_PUBLIC_USE_MOCKS=false
```

No hay que tocar ningún componente: `listPayments` cambia de fuente solo.

## Simulador (solo desarrollo)

- 120 pagos en BOB y USD, referencias `ORD-2026-0001…`, los tres métodos, los siete estados,
  ambos ambientes y fechas de los últimos 30 días (determinista: mismos datos en cada carga).
- Aplica de verdad filtros, búsqueda, orden y paginación: `from` inclusivo, `to` exclusivo y
  `limit` máximo 100, igual que el backend.
- Latencia artificial de 300 ms.
- Para forzar el estado de error en desarrollo agrega el parámetro `mockError` a la URL:

```
/dashboard/pagos/transacciones?mockError=429   → rate_limit_exceeded (mensaje + botón Reintentar)
/dashboard/pagos/transacciones?mockError=500   → error del servidor
/dashboard/pagos/transacciones?mockError=400   → validation_error
```

Valores admitidos: `400`, `401`, `403`, `429` y `500`. En producción el parámetro se ignora.

## Fechas y montos

- `from`/`to` se envían como fecha-hora ISO-8601 UTC con `Z` (ej. `2026-10-16T04:00:00.000Z`).
  La interfaz pide días en America/La_Paz: `Desde` = inicio del día (inclusivo) y
  `Hasta` = inicio del día siguiente (exclusivo), es decir «hasta el día X incluido».
- Los montos se reciben como strings decimales y **nunca** se convierten a `number`:
  solo se formatean para mostrar (separador de miles y 2 decimales).
- Las fechas se muestran en `America/La_Paz` con formato `dd/mm/aaaa hh:mm`.

## Archivos

```
transacciones/
├── page.tsx                     # Ruta; envuelve la pantalla en <Suspense> (useSearchParams)
├── payment-filters.ts           # URL ↔ filtros, atajos y conversión a parámetros de la API
├── payment-format.ts            # Montos y fechas para mostrar
├── components/
│   ├── transactions-screen.tsx  # Orquestación (TanStack Query + sincronización con la URL)
│   ├── transactions-filters.tsx # Barra de filtros (búsqueda con debounce de 400 ms)
│   ├── transactions-table.tsx   # Tabla, orden del servidor, skeleton y estados vacío/error
│   └── transactions-pagination.tsx
└── README.md
```

## Pruebas

```bash
npm test        # tests/transactions-mock.test.mjs y tests/transactions-filters.test.mjs
npm run lint
npx tsc --noEmit
```
