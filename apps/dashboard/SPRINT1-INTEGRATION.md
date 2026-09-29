# Integración Sprint 1

> **Sprint 1 demo mode: frontend ejecutado con datos mock por indisponibilidad temporal de integración backend.**

La constante central `src/lib/demo-mode.ts` mantiene desactivadas todas las llamadas backend desde la interfaz. La capa de servicios se conserva para una integración futura, pero Login, Activación, Tenants, Dashboard y API Keys funcionan con datos locales durante la demo.

## Cierre y bloqueo de integración real

Validación de cierre del 29 septiembre 2026: fetch completado; la referencia de Jean sigue en `ceed07760e6916bb64299b10c1c68e2381dee32e`. Se revisaron su guía de puesta en marcha, Docker Compose y controllers sin cambiar de rama ni copiar/modificar backend.

El intento del comando documentado `docker compose up --build -d api` quedó bloqueado antes de iniciar: PowerShell no reconoce `docker`; tampoco existe el ejecutable en `C:/Program Files/Docker/Docker/resources/bin/docker.exe`. No existen `.env` raíz ni `apps/api/.env`; `DATABASE_URL` y `DIRECT_URL` tampoco están definidas en el entorno. La alternativa sin Docker igualmente necesita PostgreSQL de desarrollo y servicios auxiliares RabbitMQ/Mailpit según la guía. No se instalaron servicios ni se inventaron credenciales.

Por ello NO se ejecutaron operaciones reales de activación, creación de tenant, generación/listado/revocación de API Keys. Las pruebas de contratos utilizan fetch simulado y no acreditan integración end-to-end. Para completar esta validación falta provisionar el entorno de desarrollo de Jean y un buzón Mailpit, configurar CORS/FRONTEND_URL y las variables frontend indicadas abajo. Se conservan las simulaciones actuales.

Backend inspeccionado en modo lectura: `origin/feature/back1-jean`, commit `ceed07760e6916bb64299b10c1c68e2381dee32e` (29 septiembre 2026), después de `git fetch origin`. No se incorporó código de esa rama.

## Configuración

Copiar `.env.example` a `.env.local` y reiniciar Next cuando se quiera conectar una API ya levantada. Sin `NEXT_PUBLIC_API_URL`, las pantallas siguen en demostración local.

- `NEXT_PUBLIC_API_URL=http://localhost:4000/api`: base con prefijo `/api`. No poner secretos.
- `NEXT_PUBLIC_API_DEV_MODE=true`: habilita **solo con `next dev`** el contrato de pruebas `x-user-role: PLATFORM_ADMIN` que ofrece el backend. No es login, ni una sesión de Owner. No funciona en producción.
- `NEXT_PUBLIC_API_DEV_TENANT_ID`: UUID de un tenant existente para probar endpoints de keys como administrador local. No se adivina ni se obtiene de un usuario ficticio.
- API: `PORT` (4000 por defecto), `CORS_ORIGIN` y `FRONTEND_URL` deben coincidir con el origen frontend, por ejemplo `http://localhost:3001`. Requiere `DATABASE_URL`, `DIRECT_URL`, catálogo de planes/roles y configuración RabbitMQ (`RABBITMQ_URL` o `RABBITMQ_HOST/USER/PASS`). Invitaciones requieren `MAIL_PROVIDER`, `MAIL_HOST/PORT/FROM` o `RESEND_API_KEY` exclusivamente en backend. No copiar estas credenciales al frontend.

Con URL configurada, un fallo real se muestra como error y nunca se convierte silenciosamente en éxito demo. Sin modo de integración explícito, las acciones protegidas informan que falta autenticación.

## Contratos reales

Todos los archivos siguientes pertenecen a `apps/api/src/modules/identity/` en la rama remota. Prefijo global confirmado en `apps/api/src/main.ts`.

| Flujo | Método y URL | Body | Response | Errores | Implementación | Conexión frontend |
|---|---|---|---|---|---|---|
| Login | No existe | — | — | — | No controller/login/JWT encontrado | Demo. Sin token ni redirección real por rol |
| Activación | POST `/api/identity/activate-invitation` | `{email,token,password}`; token mínimo 32, contraseña mínimo 12 | 200 `{message}` | 400 validación o invitación inválida/expirada/usada; 500 servidor | `presentation/http/identity.controller.ts`; `application/use-cases/activate-invitation.use-case.ts`; `application/dto/activate-invitation.dto.ts` | Conectada cuando hay API URL. Email editable, prellenado desde `?email=` como en el correo del backend |
| Crear tenant | POST `/api/tenants` | `{name,taxId,contactEmail,plan?,webhookUrl?,metadata?}`; nombre mínimo 2; NIT alfanumérico/guiones 5–20; plan free/premium | 201 `{id,name,taxId,contactEmail,plan,status,webhookUrl?,metadata?,owner:{userId,email,role,status,invitationExpiresAt?},invitationQueued,apiKeys:[{type,rawKey,keyPrefix,maskedKey}],createdAt}` | 400 DTO; 403 rol; 409 nombre/NIT/email duplicado; 500 persistencia | `presentation/http/tenants.controller.ts`; `application/use-cases/create-tenant.use-case.ts`; `application/dto/create-tenant.dto.ts`, `tenant-response.dto.ts` | Conectada en integración local explícita. Raw keys iniciales se descartan, no se persisten ni muestran al owner ficticio |
| Listar tenants | No existe GET `/tenants` | — | — | — | Controller solo tiene POST | Lista demo sin API; con API solo altas de esta navegación, sin fingir listado completo |
| Generar key | POST `/api/tenants/:tenantId/api-keys` | `{name,type,expiresAt?}`; nombre 2–80; type test/live | 201 metadatos de key + `rawKey` | 400 DTO; 401 contexto/rol; 403 guard; 404 tenant; 500 | `presentation/http/api-keys.controller.ts`; `application/use-cases/generate-api-key.use-case.ts`; `application/dto/generate-api-key.dto.ts` | Generación test conectada en modo local; rawKey solo en memoria hasta confirmar o salir |
| Listar keys | GET `/api/tenants/:tenantId/api-keys` | Sin body | 200 `[{id,tenantId,name,type,keyPrefix,maskedKey,isActive,expiresAt?,lastUsedAt?,createdAt}]`; nunca rawKey/hash | 401 contexto; 403 guard; 404 tenant; 500 | mismo controller; `application/use-cases/list-api-keys.use-case.ts`; `application/dto/api-key-response.dto.ts` | Conectada en modo local; se muestran todos los resultados y estados |
| Revocar key | DELETE `/api/tenants/:tenantId/api-keys/:apiKeyId` | Sin body | 200 metadatos key con `isActive:false`; idempotente si ya revocada | 401 contexto; 403 guard; 404 key no pertenece al tenant/no existe; 500 | mismo controller; `application/use-cases/revoke-api-key.use-case.ts` | Conectada con confirmación en modo local |
| Regeneración | No existe endpoint atómico | — | — | — | No implementado | Solo demo. En modo real botón deshabilitado; generación y revocación separadas explícitas |

Errores HTTP: `{statusCode,error,message:string|string[],timestamp,path,method}` según `apps/api/src/shared/http/http-exception.filter.ts`. Cliente maneja mensajes de validación, red/timeout y 5xx sin exponer detalles internos.

## Diferencias y pendientes

- `RolesGuard` acepta `request.user.role`; solo en desarrollo permite `x-user-role`. No hay middleware de autenticación/JWT que suministre `request.user`. `CurrentTenant` usa `request.tenantId || request.user.tenantId`; no acepta un header de tenant inventado. OWNER/ADMIN requieren ese contexto; PLATFORM_ADMIN local puede usar el tenant de la ruta.
- Roles de dominio: PLATFORM_ADMIN, OWNER, ADMIN; en BD `platform_admin`, `tenant_owner`, `tenant_admin`. No hay respuesta de login/token del cual extraerlos. Redirecciones reales a `/admin` y `/dashboard` y protección de rutas quedan pendientes del contrato de autenticación. Estas vistas no constituyen control de acceso.
- Creación usa tablas `tenant`, `app_user`, `role`, `plan`, `api_key` y outbox. Activación consulta `app_user` por hash del token, establece password hash y consume la invitación. Keys consultan `tenant`/`api_key`.
- DTO de tenant no acepta razón social ni dirección como campos superiores. Se envían como `metadata.businessName` y `metadata.fiscalAddress`. Persistencia actual fija `business_name = name` y no rellena `address`. Falta soporte backend para el modelo completo; no se envían campos que `forbidNonWhitelisted` rechazaría.
- `invitationQueued:true` confirma encolado, no entrega del correo. La UI conserva “Invitación enviada a [email]” y aclara el encolado.
- Backend devuelve una sola credencial secreta `rawKey`; el campo API Key muestra `maskedKey`. No hay pareja pública/privada. Nunca se intenta recuperar `secret_hash`. Al confirmar se elimina el secret del estado; al navegar o recargar se pierde, y GET no lo devuelve. En demo solo se guarda metadata ficticia en sessionStorage, nunca el secret.
- Dashboard muestra tenant/usuario demo, o contexto de pruebas identificado como tal. No se inventa identidad autenticada.
- `/activar-cuenta/demo`, `/expirado`, `/usado` son fixtures solo con API URL vacía; con backend configurado se valida exclusivamente en servidor.
- Error demo de keys: `?simularError=regeneracion` falla el primer intento y permite reintentar; `?simularError=copia` muestra error de portapapeles.

## Validación

`npm run build`, `npx --no-install tsc --noEmit --incremental false` desde dashboard, y `npm test` en raíz. El script test raíz usa `--if-present`; el setup no tiene suite de frontend registrada.

Pruebas de contratos con fetch simulado, sin red ni escrituras reales: `node --test apps/dashboard/tests/api-contracts.test.mjs` desde raíz. No equivalen a pruebas contra Supabase/API desplegada.

`npm run lint` está bloqueado por ausencia de `eslint.config.*` en esta rama. No se copia configuración de otro compañero. Se puede validar el alcance con los presets ya instalados mediante ESLint en memoria.
