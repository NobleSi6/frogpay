# Guía para poner FrogPay en marcha

Esta guía sirve para preparar el entorno de desarrollo en una computadora nueva. Los comandos se ejecutan desde la carpeta raíz del repositorio, donde están `package.json` y `docker-compose.yml`.

## 1. Dependencias necesarias

- Git para descargar el repositorio.
- Docker Desktop con Docker Compose habilitado.
- Node.js 22 LTS y npm, si se ejecutarán comandos de desarrollo o Prisma desde la computadora. Los Dockerfiles del proyecto usan Node 22.
- Acceso a una base de datos PostgreSQL de desarrollo compatible con el esquema de FrogPay. El `docker-compose.yml` actual no crea PostgreSQL: las variables de ejemplo están preparadas para conectar con Supabase. Usa credenciales de desarrollo, nunca las de producción.

RabbitMQ, Redis y Mailpit se levantan como contenedores; no hace falta instalarlos por separado.

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

1. Reemplaza `<PROJECT_REF>`, `<PASSWORD>`, `<HOST_POOLER>` y `<HOST>` en `DATABASE_URL` y `DIRECT_URL` con las credenciales del proyecto PostgreSQL de desarrollo. Usa un usuario de aplicación que no tenga `BYPASSRLS`. Si la contraseña contiene caracteres especiales, codifícala para URL.
2. Cambia `RABBITMQ_PASS` por una contraseña local. El mismo valor se usa para RabbitMQ en Docker.
3. Conserva `MAIL_PROVIDER=mailpit` para recibir los correos de desarrollo en la bandeja local.
4. Deja `NEXT_PUBLIC_API_URL=http://localhost:4000` para el dashboard local.

Guarda el archivo con el nombre exacto `.env` (sin agregar `.txt`). El archivo `.env` está ignorado por Git; **no lo subas al repositorio ni compartas sus credenciales**. Versionamos `.env.example`, que debe contener solo valores ficticios o instrucciones.

> Cada integrante debe crear su propio `.env` con sus credenciales de desarrollo. No es necesario ni seguro enviarse el archivo por chat.

## 4. Instalar y arrancar los servicios

Desde la raíz del proyecto:

```sh
docker compose up --build -d
docker compose ps
```

La primera ejecución puede tardar mientras Docker descarga las imágenes e instala dependencias. El entorno inicia la API, el dashboard, Redis, RabbitMQ y Mailpit.

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
- Swagger de la API: <http://localhost:4000/api/docs>
- Salud de la API: <http://localhost:4000/health>
- Bandeja de correo Mailpit: <http://localhost:8025>
- Administración de RabbitMQ: <http://localhost:15672> (usuario y contraseña definidos en el `.env`)

Los correos enviados por la aplicación en desarrollo aparecen en Mailpit; no se entregan a una dirección real.

## 6. Ejecutar API y dashboard fuera de Docker (opcional)

Docker debe seguir ejecutando los servicios auxiliares:

```sh
docker compose up -d redis rabbitmq mailpit
```

Instala las dependencias del monorepo desde la raíz:

```sh
npm ci
npm exec -w apps/api -- prisma generate
```

Para que la API encuentre sus variables al ejecutarse fuera de Docker, crea `apps/api/.env` a partir de `apps/api/.env.example` y completa allí `DATABASE_URL`, `DIRECT_URL` y `RABBITMQ_PASS`. En ese archivo, `MAIL_HOST=localhost` y `RABBITMQ_HOST=localhost` son los valores adecuados para conectarse a los servicios publicados por Docker.

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
- **No conecta a PostgreSQL:** revisa los hosts, puertos, usuario y contraseña de `DATABASE_URL` y `DIRECT_URL`; confirma que son de una base de desarrollo accesible desde tu red.
- **RabbitMQ no inicia:** verifica que `RABBITMQ_PASS` exista en el `.env` raíz y que Docker esté activo.
- **No aparece el correo:** abre Mailpit en <http://localhost:8025> y revisa `docker compose logs api`.
- **Revisar el estado de los servicios:** ejecuta `docker compose ps` y `docker compose logs -f api`.
