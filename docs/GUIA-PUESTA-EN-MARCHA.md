# Guía para poner FrogPay en marcha

Esta guía sirve para preparar el entorno de desarrollo en una computadora nueva. Los comandos se ejecutan desde la carpeta raíz del repositorio, donde están `package.json` y `docker-compose.yml`.

## 1. Dependencias necesarias

- Git para descargar el repositorio.
- Docker Desktop con Docker Compose habilitado.
- Node.js 22 LTS y npm, si se ejecutarán comandos de desarrollo o Prisma desde la computadora. Los Dockerfiles del proyecto usan Node 22.
- Una base de datos PostgreSQL de desarrollo: puede ser el servicio local del Compose o una instancia gestionada. Usa credenciales de desarrollo, nunca las de producción.

PostgreSQL, RabbitMQ, Redis y Mailpit se levantan como contenedores; no hace falta instalarlos por separado si usas la base local.

## 2. Descargar el proyecto

Clona el repositorio y entra a la carpeta del proyecto:

```sh
git clone <URL_DEL_REPOSITORIO>
cd frogpay
```

Si el equipo trabaja sobre `develop`, actualiza esa rama antes de comenzar:

```sh
git switch develop
git pull origin develop
```

## 3. Crear y guardar el archivo `.env`

Desde la raíz del repositorio, crea una copia del ejemplo.

En PowerShell:

```powershell
Copy-Item .env.example .env
```

En macOS o Linux:

```sh
cp .env.example .env
```

Abre el archivo **`.env` de la raíz** en el editor y completa los valores:

1. Elige una sola opción para PostgreSQL:
   - **Compose local:** usa `POSTGRES_USER=frogpay_local`,
     `POSTGRES_PASSWORD=<contraseña-local-fuerte>` y
     `POSTGRES_DB=frogpay_local`. En las URLs de conexión dentro de Docker el
     host es `postgres` y el puerto `5432`. Configura `DIRECT_URL` con la cuenta
     propietaria/migradora y `DATABASE_URL` con el usuario runtime `frogpay_app`
     (sin `BYPASSRLS`).
   - **Instancia gestionada:** reemplaza los marcadores de `DATABASE_URL` y
     `DIRECT_URL` con credenciales de desarrollo accesibles desde Docker. El
     usuario de runtime debe carecer de `BYPASSRLS`. Codifica para URL los
     caracteres especiales de las contraseñas.
2. Cambia `RABBITMQ_PASS` por una contraseña local. El mismo valor se usa para RabbitMQ en Docker.
3. Conserva `MAIL_PROVIDER=mailpit` para recibir los correos de desarrollo en la bandeja local.
4. Para el Dashboard abierto en el navegador, configura
   `NEXT_PUBLIC_API_URL=https://localhost:8443`; NGINX es el punto de entrada
   publicado al host. No uses `http://localhost:4000`: la API no publica ese
   puerto en el Compose normal.

### Preparar PostgreSQL local y el rol RLS

Inicia la base y espera a que indique estado saludable:

```sh
docker compose up -d postgres
docker compose ps postgres
```

Abre una sesión `psql` como administrador local:

```sh
docker compose exec postgres psql -U frogpay_local -d frogpay_local
```

En el prompt de `psql`, crea el rol runtime con una contraseña propia y sin
`BYPASSRLS`:

```sql
CREATE ROLE frogpay_app WITH LOGIN PASSWORD 'REEMPLAZA_POR_UNA_CLAVE_LOCAL_FUERTE' NOBYPASSRLS;
```

Sal con `\q`. En `.env`, configura `DATABASE_URL` para conectar como
`frogpay_app` a `postgres:5432/frogpay_local` y `DIRECT_URL` como
`frogpay_local` a la misma base. Usa las mismas credenciales `POSTGRES_*` que
configuraste para el servicio PostgreSQL. El primer arranque de PostgreSQL
inicializa su volumen con esos valores; cambiar las variables después no
modifica un volumen previamente creado.

Guarda el archivo con el nombre exacto `.env` (sin agregar `.txt`). El archivo `.env` está ignorado por Git; **no lo subas al repositorio ni compartas sus credenciales**. Versionamos `.env.example`, que debe contener solo valores ficticios o instrucciones.

> Cada integrante debe crear su propio `.env` con sus credenciales de desarrollo. No es necesario ni seguro enviarse el archivo por chat.

## 4. Instalar y arrancar los servicios

Desde la raíz del proyecto, levanta el stack con el proxy TLS:

```sh
docker compose --profile proxy up --build -d
docker compose ps
```

La primera ejecución puede tardar mientras Docker descarga las imágenes e instala dependencias. El entorno inicia la API, el dashboard, PostgreSQL, Redis, RabbitMQ, Mailpit y NGINX.

Aplica las migraciones y carga el catálogo de planes:

```sh
docker compose exec api npm exec -w apps/api -- prisma migrate deploy
docker compose exec api npm run db:seed -w apps/api
```

Si `api` no está en ejecución, revisa los logs antes de continuar:

```sh
docker compose logs --tail=100 api
docker compose logs --tail=100 rabbitmq
```

## 5. Direcciones locales

- Dashboard con Docker Compose: <http://localhost:3001>
- Dashboard con `npm run dev:dashboard`: <http://localhost:3000>
- Swagger de la API con proxy: <https://localhost:8443/api/docs>
- Salud de la API con proxy: <https://localhost:8443/health>
- Bandeja de correo Mailpit: <http://localhost:8025>
- Administración de RabbitMQ: <http://localhost:15672> (usuario y contraseña definidos en el `.env`)

El certificado del proxy es autofirmado y puede requerir aceptar la advertencia
del navegador. Los correos enviados por la aplicación en desarrollo aparecen
en Mailpit; no se entregan a una dirección real. Si cambias
`NEXT_PUBLIC_API_URL`, reconstruye/recrea Dashboard:

```sh
docker compose --profile proxy up -d --build --force-recreate dashboard nginx
```

## 6. Ejecutar API y dashboard fuera de Docker (opcional)

Docker debe seguir ejecutando los servicios auxiliares y PostgreSQL (si elegiste
la opción local):

```sh
docker compose up -d postgres redis rabbitmq mailpit
```

Instala las dependencias del monorepo desde la raíz:

```sh
npm ci
npm exec -w apps/api -- prisma generate
```

Para que la API encuentre sus variables al ejecutarse fuera de Docker, crea `apps/api/.env` a partir de `apps/api/.env.example` y completa allí `DATABASE_URL`, `DIRECT_URL` y `RABBITMQ_PASS`. Para servicios publicados por Docker, usa `localhost` como host de RabbitMQ/Redis/Mailpit; para PostgreSQL local publicado, usa `localhost:5433`.

Abre dos terminales desde la raíz. En la primera:

```sh
npm run dev:api
```

En la segunda:

```sh
npm run dev:dashboard
```

## 7. Detener los servicios

```sh
docker compose down
```

Esto detiene los contenedores y conserva los volúmenes locales de Redis y RabbitMQ. `docker compose down -v` también borra esos datos persistidos; úsalo solo si quieres reiniciar esos servicios desde cero.

## Solución rápida de problemas

- **La API indica que falta `DATABASE_URL`:** confirma que `.env` está en la raíz y que no se guardó como `.env.txt`.
- **No conecta a PostgreSQL:** desde contenedores usa el hostname `postgres:5432` (no `localhost`) para la base local; desde procesos del host usa `localhost:5433`. Revisa usuario, contraseña y estado con `docker compose ps postgres`.
- **La migración informa que no existe `frogpay_app`:** crea el rol runtime como se indica en “Preparar PostgreSQL local y el rol RLS” antes de aplicar migraciones.
- **El Dashboard llama a `localhost:4000` o muestra `ERR_CONNECTION_REFUSED`:** configura `NEXT_PUBLIC_API_URL=https://localhost:8443`, inicia el perfil `proxy` y reconstruye Dashboard.
- **RabbitMQ no inicia:** verifica que `RABBITMQ_PASS` exista en el `.env` raíz y que Docker esté activo.
- **No aparece el correo:** abre Mailpit en <http://localhost:8025> y revisa `docker compose logs api`.
- **Revisar el estado de los servicios:** ejecuta `docker compose ps` y `docker compose logs -f api`.
