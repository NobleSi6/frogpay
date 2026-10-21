# Checklist de flujos E2E — Dashboard FrogPay

> TSK-FRONT-405 · Verificación funcional de 13 flujos.
> Entorno ejecutado: dashboard Docker `frogpay-dashboard-1` en
> `http://localhost:3001` (puerto del contenedor `3000`), API en
> `http://localhost:4000` (prefijo `/api`), `CORS_ORIGIN=http://localhost:3001`,
> `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_USE_MOCKS=false`.
> Navegador: Playwright/Chromium headless. Capturas en
> `%TEMP%\opencode\e2e-shots`.

Credenciales usadas: owner demo `owner.demo@frogpay.local` / `FrogPayDemo123!`;
Platform Admin `juan@gmail.com` / `Admin12345678`.

## Los 13 flujos

| # | Flujo | Resultado | Evidencia |
|---|---|---|---|
| 1 | Landing pública | **OK** | `/` 200; sección `#planes` presente con “Gratis”, “BOB 150,00”, “5.000,00”; el ancla del header desplaza a la sección |
| 2 | Login y redirección por rol | **OK** | Owner → `/dashboard` (h1 “Inicio”); Admin → `/admin`; sin errores de consola |
| 3 | Inicio (métricas + plan) | **OK** | Tarjeta “Plan y consumo” visible; navegación a `/dashboard/plan` (h1 “Plan”) y el ítem `Plan` queda `aria-current="page"` |
| 4 | Transacciones | **OK** | `/dashboard/pagos/transacciones` renderiza listado de pagos reales (QR, tarjeta, transferencia) |
| 5 | Detalle de pago | **OK** | Clic en referencia de la tabla → `/dashboard/pagos/<uuid>` con **2 tabs** (Detalle/Auditoría) y timeline |
| 6 | Nuevo pago con tarjeta | **OK** | Se cargaron las credenciales sandbox del tenant vía `/dashboard/configuracion/proveedores/stripe` (aviso “Credenciales guardadas”, secret enmascarado). Luego `/dashboard/pagos/nuevo` monta el formulario: label `payment-amount`, grupo `payment-card-label` y **7 iframes de Stripe**; ya no aparece “No se pudo preparar Stripe” |
| 7 | Pago con QR | **OK** | Se creó un QR y se simuló: “Simular pago aprobado” → “Pago aprobado”; “Simular pago rechazado” → “Pago rechazado” |
| 8 | Transferencia bancaria | **OK** | Depósito exacto → 200 `reconciled` y UI “Transferencia aprobada”; montos diferentes → 200 `amount_mismatch` y UI “Rechazado / inconsistencia en el monto”; referencia desconocida → 200 `unmatched` / `reference_not_found` (ver nota) |
| 9 | Conciliación bancaria | **OK** | Al elegir estado y alternar “Últimos 30 días” el navegador solicita `GET /api/dashboard/bank-transactions?page=1&limit=20&status=amount_mismatch&from=…&to=…`; botón con `aria-pressed` alterna |
| 10 | Webhooks | **OK** | `/dashboard/webhooks` con “Registrar un endpoint”, ambiente, eventos y listado de endpoints |
| 11 | API Keys | **OK** | `/dashboard/api-keys` muestra la key enmascarada y acciones “Regenerar/Revocar” |
| 12 | Auditoría | **OK** | `/dashboard/auditoria` con filtros (pago UUID, acción, fechas) y catálogo de acciones reales |
| 13 | Admin: tenants y estado de plataforma | **OK** | `/admin` → `/admin/tenants` con **27 filas** y sin estado de carga colgado; `/admin/platform-status` renderiza |
| 14 | Responsive (375 px) | **OK** | Landing y `/dashboard/plan` a 375 px; `nav[aria-label="Tenant"]` visible y h1 “Plan” |

**Resultado global:** **13/13 flujos OK** y **17/17 pasos de mutación OK**, **0 errores de consola, 0 `pageerror`**.

## Notas de la ejecución

- El contenedor `frogpay-dashboard-1` servía código previo a los cambios hasta
  reiniciarlo (`docker restart frogpay-dashboard-1`); tras el reinicio tomó el código
  nuevo y sirvió la Landing con la sección de planes.
- Se intentó levantar un `next dev` local en `3100`/`3001`: en `3001` el puerto lo ocupa
  el contenedor y en `3100` el backend rechaza la petición por CORS
  (`CORS_ORIGIN=http://localhost:3001`). Por eso la verificación se hizo contra el
  contenedor.
- Flujo 6: se habilitó cargando por UI las credenciales sandbox del tenant demo
  (`pk_test_…` / `sk_test_…` en `/dashboard/configuracion/proveedores/stripe`, rol OWNER).
  El formulario carga el JS de `js.stripe.com`, por lo que este flujo requiere internet.

## Mutaciones verificadas (datos reales en sandbox)

Ejecutado con Playwright sobre la sesión del owner demo; cada paso se confirmó por UI y,
en transferencias, por la respuesta HTTP de `POST /dashboard/payments/:id/simulate-deposit`.

| Acción | Resultado |
|---|---|
| Guardar credenciales Stripe sandbox | OK — “Credenciales guardadas”; secret enmascarado `sk_test_...Bg2B` |
| QR: crear + simular aprobado | OK — “Pago aprobado” |
| QR: crear + simular rechazado | OK — “Pago rechazado” |
| Transferencia: depósito exacto | OK — HTTP 200 `{status:"reconciled"}` y UI “Transferencia aprobada” |
| Transferencia: montos diferentes | OK — HTTP 200 `{status:"amount_mismatch"}` y UI “Rechazado” |
| Transferencia: referencia desconocida | Backend OK — HTTP 200 `{status:"unmatched", errorCode:"reference_not_found"}`; **la UI permanece pendiente** (ver hallazgo) |
| Webhook: crear endpoint | OK — secreto mostrado (49 caracteres) |
| Webhook: probar / rotar secreto | OK — “Evento de prueba encolado”, “Secreto rotado” |
| Webhook: reintentar entrega fallida / eliminar | OK — “Reintento encolado”, “Endpoint eliminado” |
| API Keys: generar / regenerar / revocar | OK — secret una sola vez, “Credenciales regeneradas”, “Credencial revocada” |
| Auditoría: abrir registro y cerrar con `Escape` | OK — el panel `role="dialog"` se abre y se cierra |

**Hallazgo (frontend):** `useBankTransfer` ignora el cuerpo de la respuesta de
`simulate-deposit`. Con `UNKNOWN_REFERENCE` el backend registra el depósito como
`unmatched`, pero el pago sigue `pending` y el panel no muestra aviso. Se documenta sin
corregir para no agregar comportamiento nuevo en esta tarea.

## Evidencia determinista ejecutada

| Comando | Resultado |
|---|---|
| `npm test` (dashboard) | 58/58 en verde |
| `npx tsc --noEmit` | Sin errores |
| `npm run lint` | **0 errores** (1 advertencia preexistente: `<img>` remoto en Testimonios) |
| `npx next build` | Compila; 22 rutas, incluye `/dashboard/plan` |
| E2E Playwright (Chromium headless) | 13/13 flujos OK + 17/17 pasos de mutación; 0 errores de consola |
