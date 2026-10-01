# Integración Sprint 1

Estado revisado sobre `develop` el 1 de octubre de 2026.

## Modos de ejecución

El dashboard conserva el modo demo para trabajar sin las dependencias locales del backend:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_API_DEV_MODE=false
```

Para usar la integración real, la API, PostgreSQL, RabbitMQ y el proveedor de correo deben estar disponibles:

```env
NEXT_PUBLIC_DEMO_MODE=false
```

La sesión real usa un Bearer JWT emitido por la API. El modo demo conserva credenciales ficticias únicamente cuando `NEXT_PUBLIC_DEMO_MODE=true`.

## Contratos presentes en develop

La API usa el prefijo `/api`; `NEXT_PUBLIC_API_URL` contiene sólo el origen y el cliente agrega el prefijo.

| Flujo | Contrato | Estado en frontend |
|---|---|---|
| Login | `POST /api/identity/login` | Login real; guarda la sesión Bearer local para navegar |
| Usuario actual | `GET /api/identity/me` | Revalida usuario, rol y tenant de la sesión |
| Activación | `POST /api/identity/activate-invitation` con `{email, token, password}` | Servicio real disponible; los tokens `demo`, `expirado`, `usado`, `invalido` y `restringido` siguen siendo fixtures locales |
| Crear tenant | `POST /api/tenants` con `{name, taxId, contactEmail, metadata?}` | Real, autorizado para Platform Admin |
| Listar tenants | `GET /api/tenants` | Real, autorizado para Platform Admin |
| Generar API Key | `POST /api/tenants/:tenantId/api-keys` | Real; muestra `rawKey` una sola vez |
| Listar API Keys | `GET /api/tenants/:tenantId/api-keys` | Real; sólo datos enmascarados |
| Revocar API Key | `DELETE /api/tenants/:tenantId/api-keys/:apiKeyId` | Real con confirmación |
| Regenerar API Key | `POST /api/tenants/:tenantId/api-keys/:apiKeyId/regenerate` | Real y atómica; revoca la anterior y muestra el nuevo secret una sola vez |

El formato de error real es `{statusCode, error, message, timestamp, path, method}`. El cliente conserva el estado HTTP, une mensajes de validación y oculta detalles internos de errores 5xx.

## Límites actuales

- El adaptador mock y sus credenciales ficticias existen únicamente como fallback cuando `NEXT_PUBLIC_DEMO_MODE=true`.
- `AuthenticationGuard` valida firma, emisor, audiencia y expiración del JWT; `RolesGuard` autoriza con el rol autenticado. El header local sigue habilitado fuera de producción para pruebas administrativas mientras se provisiona un Platform Admin real.
- OWNER y ADMIN usan siempre el tenant de la sesión; no confían en el UUID de la URL.
- El DTO de tenant no admite razón social ni dirección como campos superiores. El frontend los envía dentro de `metadata.businessName` y `metadata.fiscalAddress`.
- Los secretos de API Keys sólo se mantienen en memoria hasta que el usuario confirma que los guardó. Nunca se consulta ni muestra `secret_hash`.
- Los `.env` locales están ignorados. `DATABASE_URL`, `DIRECT_URL`, RabbitMQ y Resend deben configurarse localmente y nunca documentarse, versionarse ni enviarse al navegador.

## Validación

Los contratos frontend se comprueban sin escrituras reales con:

```sh
node --test apps/dashboard/tests/api-contracts.test.mjs
```

La prueba extremo a extremo real requiere que la API pueda iniciar con credenciales locales válidas y que PostgreSQL, RabbitMQ y el proveedor de correo estén disponibles.

La validación real cubre creación de tenant, entrega de invitación por RabbitMQ/Mailpit, activación, login Owner, `/me` y el ciclo generar/listar/regenerar/revocar API Keys. El entorno local requiere `JWT_SECRET` con al menos 32 caracteres; el valor real permanece únicamente en `.env` ignorado.
