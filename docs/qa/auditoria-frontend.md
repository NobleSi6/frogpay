# Auditoría de frontend — Dashboard FrogPay

> TSK-FRONT-405 · Sprint 4 · Cierre del frontend del MVP.
> Aplicación: `apps/dashboard` (Next.js 16 / React 19).
> Backend de referencia: `apps/api` en `http://localhost:4000` (prefijo global `/api`).

## 1. Alcance y método

- Se recorrió el código del dashboard (layouts, shells, pantallas, hooks, servicios y
  clientes HTTP) y se contrastó cada contrato con los controladores, DTOs y el catálogo
  de errores del backend.
- Se verificó la configuración de entorno (`apps/dashboard/.env`, `.env.example`,
  `api-client.ts`, `demo-mode.ts`).
- No se agregaron funcionalidades nuevas: las correcciones se limitaron a inconsistencias
  de contrato, navegación, estados, accesibilidad y datos de la Landing.
- El backend **no** fue modificado.

## 2. Resumen de estado

| Área | Estado inicial | Acción |
|---|---|---|
| Catálogo de errores (dashboard vs backend) | Incompleto (11 de 26 códigos) | Corregido |
| Navegación del sidebar Owner | Faltaban `Plan` y `Proveedores`; `Pagos` no resaltaba subrutas | Corregido |
| Conciliación bancaria | Filtros de estado y rango decorativos | Corregido |
| Lista de tenants (admin) | Sin estados de carga/vacío | Corregido |
| Accesibilidad formulario de tarjeta | Labels sin asociación | Corregido |
| Landing | Sin sección de planes | Corregido |
| Contrato de errores documentado | Desfasado (`docs/api/errores.md` dice “11 códigos”) | Reportado |
| Configuración de entorno | `.env.example` contradijo `.env` (`DEMO_MODE`/`USE_MOCKS` en `true`) | Corregido |
| ESLint | No ejecutable (versiones desalineadas + hoisting de npm) | Corregido |
| Flujo de tarjeta (Stripe) | Bloqueado por credenciales del tenant | Verificado tras cargarlas |
| Protección de rutas | Solo cliente, sin `middleware` | Reportado |
| Conciliación — estado `reference_not_found` | No mapeado en el servicio | Corregido |

## 3. Correcciones aplicadas

### 3.1 Catálogo de errores del dashboard

`src/config/frogpay-errors.ts` pasó de 11 a **26 códigos**, alineados con
`apps/api/src/shared/http/errors/error-catalog.ts` (19 códigos) y con los códigos
genéricos y de simuladores que produce `http-exception.filter.ts` y los controladores de
pago: `unauthorized`, `forbidden`, `not_found`, `internal_error`, `payment_not_found`,
`simulation_not_allowed`, `forbidden_in_production`.

Cada código tiene `message` y `action` en español, con la acción del catálogo
`UNKNOWN_FROGPAY_ERROR` manteniendo el contacto (`+591 71587251` / `frog@support.com`).
Se actualizó la prueba `tests/sprint2-dev2.test.mjs` para exigir la lista completa.

Códigos agregados: `qr_expired`, `transfer_expired`, `amount_mismatch`,
`currency_mismatch`, `reference_not_found`, `deposit_id_reused`,
`invalid_state_transition`, `rate_limit_exceeded`, `unauthorized`, `forbidden`,
`not_found`, `internal_error`, `payment_not_found`, `simulation_not_allowed`,
`forbidden_in_production`.

### 3.2 Navegación del sidebar Owner

`src/components/layout/tenant-shell.tsx`:

- Se agregó `Plan` (`/dashboard/plan`) y `Proveedores`
  (`/dashboard/configuracion/proveedores`) como ítems propios.
- `Configuración` pasó a coincidencia exacta para no resaltarse junto con `Proveedores`.
- `Pagos` ahora resalta en sus subrutas (`/nuevo`, `/qr`, `/transferencia`, `/[id]`) sin
  robar el resaltado de `Transacciones` ni `Conciliación`.
- Se creó la pantalla `src/app/(tenant)/dashboard/plan/page.tsx`, que reutiliza
  `PlanUsageCard` y `useTenantPlan` (endpoint `GET /tenants/me/plan`) y muestra además
  precio y comisiones del plan.

### 3.3 Conciliación bancaria

- `reconciliation.service.ts`: `getBankTransactions` acepta `status`, `from` y `to` y los
  envía como query params (el backend los soporta en
  `dashboard-bank-transactions.controller.ts`).
- Se agregó el mapeo del estado `reference_not_found` → `WITHOUT_REFERENCE`.
- `useReconciliation` incluye los filtros en la `queryKey`.
- `BankReconciliationTable.tsx`: “Filtrar” y “Últimos 30 días” dejaron de ser decorativos.
  Ahora hay un `select` de estado y un botón `aria-pressed` que aplica/limpia el rango de
  30 días (reenviando `from`/`to` en ISO 8601). Se agregaron `scope="col"` a los `th`.

### 3.4 Lista de tenants (admin)

- `tenant-provider.tsx` expone `isLoading` (se resuelve en `.finally`).
- `tenant-list.tsx` muestra estado de carga y usa `EmptyState` cuando no hay tenants,
  con acceso directo a “Nuevo tenant”.

### 3.5 Accesibilidad

- `CardPaymentForm.tsx`: el label de monto usa `htmlFor="payment-amount"` y el bloque de
  tarjeta se envolvió con `role="group" aria-labelledby` apuntando a su label.

### 3.6 Landing — sección de planes

- Nuevo `src/features/landing/services/plan-catalog.ts` con `LANDING_PLANS`, que **espeja el
  seed** (`apps/api/prisma/seed.ts`): Free (BOB 0, límite BOB 5 000, 3,50% + BOB 0,50,
  1 usuario) y Premium (BOB 150, sin límite, 2,50% + BOB 0,30, 10 usuarios,
  analíticas/antifraude/multi-región).
- Nuevo `PlansSection.tsx`, insertado en `app/(marketing)/page.tsx` entre Servicios y
  Testimonios, con enlace `#planes` agregado al `Header`.
- **No se consume `GET /api/plans`**: aunque `PlansController` no declara `@Roles`, el
  guard global `AuthenticationGuard` (registrado como `APP_GUARD`) lo protege y responde
  `401` sin sesión. La Landing es pública, por lo que los valores se toman del seed. Ver
  §4.6.

### 3.7 Credenciales de proveedor y flujos de mutación

- El estado “No se pudo preparar Stripe Sandbox” de `/dashboard/pagos/nuevo` se debía a que
  el tenant demo no tenía credenciales sandbox registradas; no era un defecto de UI ni algo
  resoluble desde `.env` (el `STRIPE_SECRET_KEY` del entorno pertenece al adaptador de
  plataforma).
- Se cargaron las claves sandbox del tenant desde
  `/dashboard/configuracion/proveedores/stripe` (`PUT /tenants/me/providers/stripe/credentials/sandbox`,
  rol OWNER). Tras guardarlas, el `CardElement` monta (7 iframes de `js.stripe.com`) y ya no
  aparece el mensaje de bloqueo. El formulario requiere internet.
- Se ejecutaron las mutaciones de QR, transferencia, webhooks, API Keys y auditoría (detalle
  y resultados en `docs/qa/checklist-flujos.md`, sección “Mutaciones verificadas”).
- **Hallazgo:** con la simulación `UNKNOWN_REFERENCE` el backend responde
  `{status:"unmatched", errorCode:"reference_not_found"}`, pero el pago permanece `pending`
  y `useBankTransfer` descarta la respuesta, así que la pantalla no da feedback. Se
  documenta como pendiente de UX.

### 3.8 Herramientas: ESLint y entorno de ejemplo

- `.env.example` del dashboard ahora usa `NEXT_PUBLIC_DEMO_MODE=false` y
  `NEXT_PUBLIC_USE_MOCKS=false` (coherente con `.env`) y documenta
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; la clave secreta no va en variables públicas.
- `eslint-config-next` se alineó a `16.4.2` (antes `16.3.6` frente a `next@16.4.2`). El error
  `Cannot find module 'next/dist/compiled/babel/eslint-parser'` no era solo de versiones: npm
  dejaba `eslint-config-next` en la raíz y `next` anidado en `apps/dashboard/node_modules`, así
  que el parser no resolvía. Se declaró `next` en las `devDependencies` de la raíz para que
  ambos queden co-localizados (hoisting).
- Con ESLint operativo se corrigieron sus hallazgos: imports sin uso en `HeroSection` y
  `ServicesSection`, y `set-state-in-effect` en `useReveal` (estado derivado) y en
  `PlatformStatusScreen` (carga inicial diferida sin cambiar el comportamiento). Queda 1
  advertencia (`@next/next/no-img-element`) por avatares remotos en Testimonios.

## 4. Problemas de backend / contrato (solo documentados, no corregidos)

1. **Documentación de errores desfasada.** `docs/api/errores.md` afirma “El catálogo tiene
   11 códigos” y luego lista más de 20. El código real (`error-catalog.ts`) tiene 19 y el
   filtro global genera 4 códigos más. Conviene corregir el conteo y la tabla.
2. **Contrato de resultados de pago vs error HTTP.** El dashboard ya respeta que un pago
   `rejected`/`failed` llega con `201` y `payment.errorCode` (no es error HTTP). Se deja
   constancia para evitar que futuras pantallas lo traten como excepción.
3. **`reference_not_found` fuera del DTO de respuesta.** La query de
   `bank-transactions` admite `reference_not_found`, pero el
   `PaginatedBankTransactionsResponseDto` solo enumera 4 estados
   (`reconciled`, `amount_mismatch`, `currency_mismatch`, `unmatched`). El servicio del
   dashboard ahora tolera ambos, pero el contrato de respuesta debería declararlo.
4. **Códigos de simuladores.** `payment_not_found`, `simulation_not_allowed` y
   `forbidden_in_production` no están en el catálogo central del backend
   (`error-catalog.ts`); se generan ad-hoc en los controladores/servicios. Estarían mejor
   centralizados.
5. **Códigos de guards de API Key** (`missing_api_key`, `invalid_api_key`,
   `revoked_api_key`) no aplican al dashboard (solo a la API pública) y por eso no se
   mapearon en el frontend.
6. **`GET /api/plans` requiere sesión.** El catálogo de planes está detrás del
   `AuthenticationGuard` global (responde `401` sin `Bearer`). Si se quiere alimentar la
   Landing pública con datos vivos, el backend debería marcarlo con `@Public()` o exponer
   un endpoint público equivalente. Mientras tanto, la Landing usa el seed.

## 5. Inconsistencias de configuración / riesgo

1. **`.env.example` del dashboard corregido.** Antes traía `NEXT_PUBLIC_DEMO_MODE=true` y
   `NEXT_PUBLIC_USE_MOCKS=true` mientras que `.env` los tiene en `false`. Ahora el ejemplo
   usa `false` y documenta `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. **Protección de rutas solo en cliente.** No hay `middleware.ts`; `AuthGuard` decide en
   el navegador usando `localStorage` (`frogpay.auth.session.v1`). Es aceptable para el
   MVP, pero el acceso a `/admin` y `/dashboard` no está blindado a nivel de servidor.
3. **Enlaces placeholder en la Landing.** Los enlaces sociales y buena parte del footer
   siguen en `href="#"`.
4. **Placeholder de tarea.** La consigna usa `[RUTA_LANDING]` sin reemplazar; la Landing
   real es `src/app/(marketing)/page.tsx` (`/`).

## 6. Pendientes / observaciones menores

- `AuditRecordPanel` cierra con `Escape` y enfoca el botón de cierre, pero no implementa
  una trampa de foco completa.
- El banner Sandbox se muestra desde el shell (`SandboxBanner`) en todas las pantallas del
  tenant; `EnvironmentBadge` solo se usa en algunas. Es consistente para el usuario, pero
  conviene decidir si el badge por pantalla es necesario.
- El dashboard no tiene script `typecheck` (se usa `npx tsc --noEmit`); `lint` ya funciona
  (ver §7).

## 7. Evidencia de calidad

Ejecutado en `apps/dashboard`:

| Comando | Resultado |
|---|---|
| `npm test` (`node --test tests/*.test.mjs`) | **58/58 en verde**, 0 fallos |
| `npx tsc --noEmit` | Sin errores |
| `npx next build` | Compila; `/dashboard/plan` y `/` aparecen en el árbol de rutas |
| E2E Playwright (Chromium headless, dashboard en `:3001`) | **13/13 flujos OK** y **17/17 pasos de mutación OK**, 0 errores de consola |
| `npm run lint` | **0 errores**; 1 advertencia (`@next/next/no-img-element` en Testimonios) |

Sobre ESLint: el error `Cannot find module 'next/dist/compiled/babel/eslint-parser'` tenía dos
causas. (1) `eslint-config-next` estaba en 16.3.6 frente a `next@16.4.2`; se alineó a 16.4.2.
(2) npm hoisteaba `eslint-config-next` a la raíz pero dejaba `next` anidado en
`apps/dashboard/node_modules`, por lo que el `require` interno no resolvía; se agregó `next` a
las `devDependencies` de la raíz para co-localizarlos. `npm run lint` ya se ejecuta y pasa.

## 8. Conclusión

El dashboard quedó alineado con los contratos del backend en los puntos auditados
(errores, conciliación, planes y navegación), con estados de carga/vacío y accesibilidad
corregidos. Los 13 flujos y las mutaciones (QR, transferencia, webhooks, API Keys y
auditoría) quedaron verificados en vivo contra el backend; tests, `tsc`, `lint` y build en
verde. Quedan pendientes el feedback de `UNKNOWN_REFERENCE`, la advertencia de `<img>`, la
protección de rutas y la actualización de `docs/api/errores.md`; ninguno bloquea el MVP.
Ver `docs/qa/checklist-flujos.md` para el detalle de la verificación funcional.
