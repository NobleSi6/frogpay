# Verificación Sprint 4: TSK-DEV1-403 y TSK-DEV1-404

Esta guía explica qué entregan las tareas, cómo ejecutar las pruebas localmente
sin usar Supabase y cómo interpretar los errores más comunes. Está escrita para
PowerShell en Windows, desde la raíz del repositorio.

## Qué cubre cada tarea

### TSK-DEV1-403: pruebas e2e y CI

La suite e2e usa Jest y Supertest. Las pruebas nuevas y ampliadas verifican:

- Alta de tenant y creación de API Key.
- Pagos por tarjeta, QR y transferencia, consulta de estado e idempotencia.
- Firma de webhooks y aislamiento entre tenants.
- Registro de auditoría, métricas y estado de plataforma.
- Acceso al dashboard y publicación de eventos de outbox.

El workflow `.github/workflows/ci.yml` ejecuta instalación reproducible,
migraciones y seed, auditoría de dependencias de producción, lint, pruebas
unitarias, e2e y build. Corre en pull requests dirigidos a `develop` y en push
a `develop`.

Los permisos de los endpoints se validan contra su implementación actual:
auditoría requiere `OWNER`; métricas permite `OWNER`, `OPERATOR` y `VIEWER`;
estado de plataforma requiere `PLATFORM_ADMIN`. El rol `PLATFORM_OBSERVER` no
está habilitado por el controlador actual.

### TSK-DEV1-404: documentación de API

La entrega de documentación incluye:

- `docs/api/openapi.json`: contratos, parámetros, autenticación, respuestas y
  estados de pago.
- `docs/api/guia-integracion-rapida.md`: incorporación, pagos, webhooks,
  simuladores, auditoría, métricas y estado de plataforma.
- `docs/api/postman/frogpay-sandbox.postman_collection.json`: requests y
  validaciones de respuesta para importar en Postman.

Las rutas se publican detrás del prefijo global `/api` cuando se invoca el
servidor HTTP. Por ejemplo, un endpoint documentado como
`/v1/payments` se solicita como `/api/v1/payments`.

## Requisitos para probar localmente

- Docker Desktop iniciado.
- Node.js y npm compatibles con el repositorio.
- Puertos locales `15432` y `5672` libres.
- No se requiere leer, cambiar ni compartir `apps/api/.env`.

Se usa una base de datos descartable en el puerto `15432`, porque el `5432`
puede estar ocupado por PostgreSQL de otro proyecto. No apuntes estas pruebas a
Supabase ni a una base compartida: las pruebas de integración crean y limpian
datos.

## Primera ejecución: crear servicios aislados

Abre PowerShell en la raíz (`J:\Github\frogpay`) y crea los contenedores:

```powershell
docker run --name frogpay-pr-isolated-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=frogpay_local_test_only `
  -e POSTGRES_DB=postgres `
  -p 127.0.0.1:15432:5432 `
  -d postgres:16-alpine

docker run --name frogpay-pr-isolated-rabbitmq `
  -e RABBITMQ_DEFAULT_USER=frogpay_test `
  -e RABBITMQ_DEFAULT_PASS=frogpay_test_password `
  -p 127.0.0.1:5672:5672 `
  -d rabbitmq:3-alpine
```

Espera a que los servicios respondan:

```powershell
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker exec frogpay-pr-isolated-postgres pg_isready -U postgres -d postgres *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'PostgreSQL no quedó listo' }

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker exec frogpay-pr-isolated-rabbitmq rabbitmq-diagnostics -q ping *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'RabbitMQ no quedó listo' }
```

La migración inicial revoca permisos para los roles `anon` y `authenticated`;
créelos junto con los roles de prueba. `postgres` recibe la misma contraseña
local para que la prueba QR pueda limpiar sus fixtures. Estos comandos afectan
únicamente al contenedor nuevo:

```powershell
docker exec frogpay-pr-isolated-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "CREATE ROLE frogpay_test WITH LOGIN SUPERUSER PASSWORD 'frogpay_local_test_only'" `
  -c "CREATE ROLE frogpay_app WITH LOGIN NOBYPASSRLS PASSWORD 'frogpay_local_test_only'" `
  -c "CREATE ROLE anon NOLOGIN" `
  -c "CREATE ROLE authenticated NOLOGIN" `
  -c "CREATE DATABASE frogpay_test OWNER frogpay_test"

docker exec frogpay-pr-isolated-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "ALTER ROLE postgres WITH PASSWORD 'frogpay_local_test_only'"
```

## Preparar base y catálogo

En la misma ventana de PowerShell en la que ejecutarás Jest, configura las
variables explícitamente. Deben permanecer definidas durante migraciones, seed
y pruebas; no ejecutes Jest en una ventana distinta:

```powershell
$env:FROGPAY_TEST_DATABASE_PORT = '15432'
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://frogpay_test:frogpay_local_test_only@localhost:15432/frogpay_test'
$env:DIRECT_URL = 'postgresql://frogpay_test:frogpay_local_test_only@localhost:15432/frogpay_test'
$env:PGPASSWORD = 'frogpay_local_test_only'
$env:RABBITMQ_URL = 'amqp://frogpay_test:frogpay_test_password@localhost:5672'
$env:JWT_SECRET = 'frogpay-ci-test-secret-at-least-32-characters'
```

Aplica las migraciones y carga los catálogos:

```powershell
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las migraciones' }

npm run db:seed --workspace apps/api
if ($LASTEXITCODE -ne 0) { throw 'Falló el seed' }
```

`NODE_ENV=test` evita que el seed intente crear un Platform Admin de desarrollo
y solicite credenciales adicionales de `apps/api/.env`.

## Ejecutar pruebas

Para verificar todo TSK-DEV1-403:

```powershell
$env:DATABASE_URL = 'postgresql://frogpay_app:frogpay_local_test_only@localhost:15432/frogpay_test'
npm run test:e2e --workspace apps/api -- --runInBand
```

El resultado esperado actualmente es **12 suites y 49 pruebas aprobadas**.
También puedes ejecutar solo las suites añadidas para dashboard y plataforma:

```powershell
npm run test:e2e --workspace apps/api -- --runInBand --runTestsByPath `
  test/audit-logs.e2e-spec.ts `
  test/metrics.e2e-spec.ts `
  test/platform-status.e2e-spec.ts
```

Los checks complementarios de CI se pueden reproducir así:

```powershell
npm audit --workspace apps/api --omit=dev --audit-level=moderate
npm run lint --workspace apps/api
npm test --workspace apps/api -- --runInBand --testPathIgnorePatterns=adapters/stripe/stripe-payment-provider.sandbox.spec.ts
npm run build --workspace apps/api
```

Para verificar TSK-DEV1-404, valida/importa los artefactos:

```powershell
node -e "JSON.parse(require('fs').readFileSync('docs/api/openapi.json','utf8')); JSON.parse(require('fs').readFileSync('docs/api/postman/frogpay-sandbox.postman_collection.json','utf8')); console.log('OpenAPI y colección Postman válidos')"
```

En Postman, importa `docs/api/postman/frogpay-sandbox.postman_collection.json`,
define `baseUrl` como `http://localhost:4000/api` y completa las variables
`apiKey`, `tenantId` y `ownerToken` según el entorno sandbox.

## Errores habituales

### El error solicita `localhost:5432`

La prueba QR usa el puerto `5432` por defecto para CI. En local, comprueba que
esta variable sigue configurada en la misma ventana antes de ejecutar Jest:

```powershell
$env:FROGPAY_TEST_DATABASE_PORT
$env:DATABASE_URL
```

La salida debe indicar puerto `15432`, base `frogpay_test` y usuario
`frogpay_app`. Si ejecutas Jest sin volver a asignar las variables, puede
cargar la URL de `.env` y fallar por el puerto o por usar una base compartida.
No imprimas ni compartas el contenido de `.env`.

### El outbox indica que no se debe usar Supabase

`DATABASE_URL` todavía apunta a Supabase. Reasigna la URL local con usuario
`frogpay_app` y puerto `15432`. No resuelvas este error con
`ALLOW_SHARED_DB=1`: la prueba publica mensajes y limpia filas de base de datos.

### El outbox indica que falta `JWT_SECRET`

Define el secreto ficticio de pruebas en la misma ventana de PowerShell antes
de ejecutar Jest:

```powershell
$env:JWT_SECRET = 'frogpay-ci-test-secret-at-least-32-characters'
```

No reutilices un secreto de producción o de otro entorno.

### Error de autenticación para `postgres`

La prueba QR deriva su conexión de limpieza de `DIRECT_URL` y usa
`PGPASSWORD` para conectarse como `postgres`. Asegúrate de que `PGPASSWORD`
coincida con la contraseña configurada para `postgres` en el contenedor aislado.

### Migración con rol `anon` inexistente

La inicialización omitió los roles `anon`/`authenticated`; créalos en la base
aislada siguiendo los comandos anteriores. Si la migración ya quedó marcada
como fallida, no reutilices esa base: recréala solo dentro del contenedor
descartable y vuelve a ejecutar las migraciones.

### El seed pide credenciales de Platform Admin

Confirma que `$env:NODE_ENV = 'test'` esté definido antes del seed.

## Detener los contenedores de prueba

Cuando termines, puedes detener únicamente los contenedores aislados de esta
guía:

```powershell
docker stop frogpay-pr-isolated-postgres frogpay-pr-isolated-rabbitmq
```

No detengas ni borres otros contenedores de Docker; pueden pertenecer a otros
proyectos.
