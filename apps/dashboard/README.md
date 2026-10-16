# FrogPay Dashboard

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query + NextAuth.
Arquitectura **por features**: cada dominio de negocio agrupa su UI, hooks y llamadas a la API.

## Estructura

```
apps/dashboard/
├── public/                         # Logos, imágenes y favicon
└── src/
    ├── app/                        # SOLO rutas. Las páginas son delgadas y componen features
    │   ├── (marketing)/            # Landing page pública → /
    │   ├── (auth)/
    │   │   ├── login/              # Login único; redirige según el rol
    │   │   └── activar-cuenta/[token]/  # Definir contraseña desde la invitación
    │   ├── (admin)/admin/          # Solo Platform Admin (personal FrogPay)
    │   │   └── tenants/            # Listado de tenants
    │   │       └── nuevo/          # Alta de tenant
    │   ├── (tenant)/dashboard/     # Solo Owner del comercio
    │   │   ├── pagos/
    │   │   ├── api-keys/
    │   │   ├── webhooks/
    │   │   └── configuracion/
    │   ├── api/auth/[...nextauth]/ # Handler de NextAuth
    │   ├── layout.tsx              # Layout raíz (fuentes, providers)
    │   └── globals.css
    ├── features/                   # Lógica por dominio
    │   ├── auth/
    │   ├── tenants/
    │   ├── api-keys/
    │   ├── plans/
    │   ├── payments/
    │   └── landing/
    │       ├── components/         # Componentes propios del feature
    │       ├── hooks/              # Hooks de TanStack Query (useTenants, useCreateTenant)
    │       ├── services/           # Llamadas HTTP a la API
    │       └── schemas/            # Validación de formularios con Zod
    ├── components/
    │   ├── ui/                     # Componentes base de shadcn/ui (Button, Input, Table…)
    │   ├── layout/                 # Sidebar, Header, AdminShell, TenantShell
    │   └── shared/                 # Reutilizables entre features (EmptyState, DataTable)
    ├── lib/                        # api-client, query-client, config de auth, cn()
    ├── config/                     # Ítems del menú, rutas y constantes
    ├── styles/                     # Tokens de diseño: paleta y tipografías (TSK-FRONT1-101)
    ├── types/                      # Tipos globales del front
    └── middleware.ts               # Protege rutas y redirige por rol
```

> Las carpetas entre paréntesis `( )` son *route groups*: organizan y permiten un layout distinto por grupo, pero **no aparecen en la URL**. Por ejemplo, `(tenant)/dashboard/pagos` se sirve en `/dashboard/pagos`.

### Dónde va cada tarea del Sprint 1

| Tarea | Carpeta |
|---|---|
| TSK-FRONT1-101 Paleta y tipografía | `styles/`, `tailwind.config.ts` |
| TSK-FRONT1-102 Landing page | `app/(marketing)`, `features/landing` |
| TSK-FRONT1-103 Setup + layout base | `app/layout.tsx`, `components/layout` |
| TSK-FRONT1-104 Componentes y rutas | `components/ui`, `components/shared`, `app/` |
| TSK-FRONT2-201 Login / registro | `app/(auth)`, `app/(admin)`, `features/auth`, `features/tenants` |

## Reglas

1. `app/` no contiene lógica. Una página importa componentes de `features/` y nada más.
2. Un feature **no importa a otro feature**. Lo que se comparte sube a `components/shared` o a `lib/`.
3. Nadie usa `fetch` directo en un componente: todo pasa por `features/*/services` usando `lib/api-client`, y se consume con los hooks de `features/*/hooks`.
4. Colores y tipografías se usan **solo** desde los tokens de `styles/` y Tailwind, nunca con valores hex sueltos.
5. La redirección por rol (Platform Admin → `/admin`, Owner → `/dashboard`) vive solo en `middleware.ts`.

## Validar pagos en Sandbox

Completa primero la [guía de puesta en marcha](../../docs/GUIA-PUESTA-EN-MARCHA.md) y configura las credenciales Stripe Sandbox del tenant desde **Dashboard → Configuración → Proveedores → Stripe**. El formulario de pago carga la clave publicable `pk_test_` de ese tenant; no requiere una clave de tarjeta en el cliente.

Para probar el flujo, inicia sesión como Owner, abre **Pagos → Tarjeta** y verifica en la pestaña **Red** que:

- la tarjeta se tokenice mediante Stripe Elements;
- `POST /api/dashboard/payments/test` envíe `paymentToken: "pm_..."`, JWT e `Idempotency-Key`, nunca número de tarjeta ni CVC;
- al reintentar un fallo de transporte se repitan la misma clave y el mismo cuerpo.

Los tests y la compilación del dashboard se ejecutan desde la raíz:

```sh
npm test -w apps/dashboard
npm run build -w apps/dashboard
```
