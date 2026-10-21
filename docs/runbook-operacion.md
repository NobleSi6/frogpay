# Runbook de operación — FrogPay

Runbook para el stack local/validación del MVP. En producción, adaptar cada
procedimiento al proveedor de hosting, gestión de secretos, backups y proceso
de cambios aprobado. No ejecutar comandos destructivos sobre producción sin
aprobación y backup verificado.

## 1. Arranque y estado

Desde la raíz del repositorio, con `.env` local configurado:

```bash
docker compose --profile proxy up --build -d
docker compose ps
```

Comprobar API y Dashboard:

```bash
curl -k https://localhost:8443/health
curl -I http://localhost:3001
```

El certificado del entorno local es autofirmado; `-k` es solo para diagnóstico
de desarrollo. No usarlo para ocultar errores de certificados en producción.

## 2. Logs y diagnóstico inicial

```bash
docker compose logs --tail=200 api
docker compose logs --tail=200 dashboard
docker compose logs --tail=200 nginx
docker compose logs --tail=200 postgres rabbitmq redis mailpit
docker compose ps
```

Para seguimiento en vivo:

```bash
docker compose logs -f api
```

Usar `Ctrl+C` para salir del seguimiento sin detener el contenedor.

## 3. Migraciones y catálogos

Antes de habilitar una nueva versión, revisar las migraciones y confirmar
conectividad/backup. Aplicar migraciones y seed inicial desde el contenedor API:

```bash
docker compose exec api npm exec -w apps/api -- prisma migrate deploy
docker compose exec api npm run db:seed -w apps/api
```

El seed es idempotente para los catálogos que administra. No ejecutar
`prisma db push` como sustituto de las migraciones versionadas. La base requiere
el rol de runtime `frogpay_app` con `NOBYPASSRLS`; la cuenta de migración debe
tener privilegios para aplicar DDL y conceder permisos.

## 4. Reinicio de un componente

Preferir reiniciar únicamente el servicio afectado:

```bash
docker compose restart api
docker compose restart dashboard
docker compose restart nginx
```

Si se cambió una variable `NEXT_PUBLIC_*`, recrear/reconstruir Dashboard para
que Next.js la compile en el frontend:

```bash
docker compose --profile proxy up -d --build --force-recreate dashboard nginx
```

Después validar `/health`, abrir la interfaz y revisar logs. No reiniciar
PostgreSQL/Redis/RabbitMQ sin determinar antes qué datos/colas están persistidos
y el efecto sobre procesos en curso.

## 5. Mensajes atascados y proveedores

- **Outbox pendiente:** revisar logs de API, conectividad RabbitMQ y métricas de
  outbox. Inspeccionar `last_error` antes de reencolar. Cambiar manualmente
  `failed` a `pending` solo con revisión operativa y evidencia de que el payload
  es válido; la operación puede producir publicación duplicada.
- **DLQ:** identificar cola, evento y motivo; comprobar idempotencia del handler
  antes de reproducir mensajes. No vaciar la DLQ sin guardar evidencia.
- **Circuito de proveedor abierto:** verificar primero salud/latencia del
  proveedor y credenciales; el circuito debe permitir transición a half-open.
  No deshabilitar protecciones para recuperar pagos sin evaluar cobros que el
  proveedor pudiera haber aceptado.
- **Webhook fallido:** verificar URL, DNS/TLS y respuesta del comercio. Reintentar
  desde el Dashboard únicamente cuando el endpoint pueda procesar el evento de
  forma idempotente.
- **Correo de invitación:** revisar bandeja local en `http://localhost:8025` y
  logs del worker de Notifications.

## 6. Observabilidad opcional

Iniciar los servicios observability definidos en un segundo Compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml `
  --profile proxy --profile observability up -d
```

En PowerShell la continuación de línea usa backtick; en Bash/Git Bash usar `\`.
URLs locales: Grafana `http://localhost:3002`, Prometheus
`http://localhost:9090`, Alertmanager `http://localhost:9093`. Configurar una
contraseña fuerte en `GRAFANA_ADMIN_PASSWORD`. El perfil depende de que los
archivos de configuración/volúmenes requeridos estén disponibles.

Investigar alertas de p95, 5xx, circuito abierto, DLQ y antigüedad del outbox
según [observabilidad.md](./observabilidad.md). No usar etiquetas de alta
cardinalidad con IDs de tenant/pago.

## 7. Recuperación, backups y secretos

- Realizar y probar backups de PostgreSQL según el RPO/RTO acordado para el
  ambiente. Un backup no se considera válido hasta completar una restauración
  de prueba.
- Conservar también configuraciones, claves de cifrado y procedimiento de
  rotación en un gestor de secretos; nunca almacenar secretos dentro del
  repositorio o en dumps sin protección.
- Si una API Key, credencial Stripe, JWT secret o secreto webhook se expone,
  revocarla/rotarla en su sistema propietario y revisar logs y actividad. Rotar
  `JWT_SECRET` invalida sesiones vigentes.
- `docker compose down` conserva volúmenes; `docker compose down -v` los elimina.
  No usar `-v` si se desea preservar PostgreSQL, RabbitMQ o Redis.

## 8. Detención local

```bash
docker compose --profile proxy down
```

Detener también el perfil de observabilidad si fue iniciado con archivo Compose
adicional:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml `
  --profile proxy --profile observability down
```

## 9. Incidentes y escalamiento

Registrar hora, ambiente, versión/commit, servicios afectados, request ID,
impacto financiero conocido y acciones ejecutadas. Preservar eventos/outbox,
registros de auditoría y evidencia del proveedor. Escalar incidentes de pagos,
posible doble cobro, fuga de datos o acceso cross-tenant a responsables de
seguridad y negocio; no modificar/borrar auditoría para “limpiar” un incidente.
