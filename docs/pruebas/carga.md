# Pruebas de carga y escalado horizontal — TSK-DEV2-404

## Objetivo y criterios

Los scripts permiten comprobar el comportamiento de pagos en carga y la
idempotencia compartida entre réplicas. Los valores de esta tabla son umbrales
objetivo, no resultados medidos; registra las salidas reales después de ejecutar
las pruebas.

| Métrica                                                        | Umbral objetivo |
| -------------------------------------------------------------- | --------------: |
| p95 de creación de pagos (`frogpay_payment_creation_duration`) |        < 300 ms |
| Nuevas respuestas HTTP 201 en la prueba de idempotencia        |   exactamente 1 |
| Errores HTTP durante la prueba de carga                        |           < 1 % |
| Réplicas API durante las pruebas de carga e idempotencia       |               2 |

## Entorno necesario

| Componente           | Configuración                                          |
| -------------------- | ------------------------------------------------------ |
| API                  | Dos réplicas NestJS                                    |
| Proxy                | NGINX, HTTPS local en el puerto 8443                   |
| Base de datos        | PostgreSQL de desarrollo/pruebas con tenant de pruebas |
| Caché e idempotencia | Redis compartido por las dos réplicas                  |
| Proveedor de tarjeta | Adapter mock habilitado y vinculado a `card`           |
| Prueba               | k6 instalado en la máquina que ejecuta los scripts     |

Usa exclusivamente datos y credenciales de prueba. El usuario indicado por
`K6_EMAIL` debe ser `OWNER` o `ADMIN`, y `K6_API_KEY` debe ser una API key
sandbox del mismo tenant. No uses credenciales de producción ni guardes valores
reales en el repositorio.

El login de los escenarios de smoke y carga usa `POST /api/identity/login`.
Los pagos usan la API pública `POST /api/v1/payments`, que requiere `X-Api-Key`;
las llamadas al Dashboard usan el token JWT del usuario.

## Scripts

| Archivo             | Propósito                                                                             |     Duración |
| ------------------- | ------------------------------------------------------------------------------------- | -----------: |
| `k6/smoke.js`       | Prueba rápida de tarjeta, QR, transferencia, detalles de pago y métodos del Dashboard |  1 min, 1 VU |
| `k6/load.js`        | Ramp-up 0→30 VUs, tres minutos sostenidos y ramp-down                                 |       ~5 min |
| `k6/idempotency.js` | Envíos concurrentes con la misma clave a través de dos réplicas                       | 30 s, 20 VUs |

El smoke test comprueba detalles individuales porque el API actual no expone
`GET /api/dashboard/payments` para listar pagos.

## Preparación

Desde la raíz:

1. Configura `.env` a partir de `.env.example` y configura una API key sandbox
   y un usuario `OWNER`/`ADMIN` del mismo tenant. No compartas ni registres el
   contenido de `.env`.
2. Habilita el adapter mock para tarjetas:

   ```dotenv
   PAYMENT_MOCK_ADAPTER_ENABLED=true
   PAYMENT_PROVIDER_BINDINGS=card=mock
   ```

   QR y transferencias continúan usando sus adapters locales configurados.

3. Usa un tenant de pruebas con volumen mensual disponible (preferiblemente
   Premium, cuyo volumen no está limitado por el catálogo semilla). El test de
   carga comparte el límite de solicitudes del tenant. Para no medir respuestas
   429 en lugar de la plataforma, eleva temporalmente
   `RATE_LIMIT_FREE_PER_MINUTE` y `RATE_LIMIT_PREMIUM_PER_MINUTE` (o el límite
   personalizado del plan) a un valor superior a las solicitudes esperadas;
   restaura los límites después de la prueba. Los pagos de carga son importes reales del
   sandbox, así que vigila el volumen acumulado de tu tenant.
4. Exporta las credenciales en la terminal que ejecutará k6:

   ```bash
   export K6_EMAIL='correo-del-owner-de-pruebas@example.test'
   export K6_PASSWORD='contraseña-local-de-pruebas'
   export K6_API_KEY='api-key-sandbox-del-mismo-tenant'
   ```

5. Genera el certificado local si aún no existe:

   ```bash
   ./scripts/generate-dev-cert.sh
   ```

6. Arranca dos réplicas y el proxy. El archivo de override retira el mapeo fijo
   `4000:4000` de API para que las réplicas no colisionen en el host; el tráfico
   de prueba entra por NGINX:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.k6.yml \
     --profile proxy up -d --scale api=2
   docker compose -f docker-compose.yml -f docker-compose.k6.yml \
     --profile proxy ps
   ```

   Confirma que están activas dos instancias API y que la API responde:

   ```bash
   for i in $(seq 1 30); do
     code=$(curl -sk https://localhost:8443/health -o /dev/null -w '%{http_code}')
     [ "$code" = 200 ] && break
     sleep 2
   done
   test "$code" = 200
   ```

## Ejecución

Ejecuta primero el smoke test:

```bash
k6 run \
  --env BASE_URL=https://localhost:8443 \
  --insecure-skip-tls-verify \
  k6/smoke.js
```

Si pasa, ejecuta la prueba de carga:

```bash
mkdir -p docs/pruebas
k6 run \
  --env BASE_URL=https://localhost:8443 \
  --insecure-skip-tls-verify \
  --out json=docs/pruebas/k6-load-result.json \
  k6/load.js
```

Y después la prueba de idempotencia:

```bash
k6 run \
  --env BASE_URL=https://localhost:8443 \
  --insecure-skip-tls-verify \
  --out json=docs/pruebas/k6-idempotency-result.json \
  k6/idempotency.js
```

La prueba de idempotencia considera 200 (replay), 201 (creación inicial) y 409
(otra solicitud mantiene el lock) respuestas esperadas. Su umbral requiere una
sola respuesta 201. Comprueba también la base de datos tras la prueba:

```sql
SELECT tenant_id, environment, idempotency_key, COUNT(*) AS total
FROM payment
WHERE idempotency_key = '<UUID_COMPARTIDO_DE_LA_EJECUCION>'
GROUP BY tenant_id, environment, idempotency_key
HAVING COUNT(*) > 1;
```

El resultado esperado es cero filas.

## Registro de resultados

Completa esta tabla con las salidas reales de k6; no marques el DoD como
cumplido si no se ejecutó la prueba en el entorno descrito.

| Prueba       | Fecha     | p95 de creación | Errores HTTP | Respuestas 201 con clave compartida | Resultado |
| ------------ | --------- | --------------: | -----------: | ----------------------------------: | --------- |
| Smoke        | Pendiente |       Pendiente |    Pendiente |                                 N/A | Pendiente |
| Carga        | Pendiente |       Pendiente |    Pendiente |                                 N/A | Pendiente |
| Idempotencia | Pendiente |             N/A |    Pendiente |                           Pendiente | Pendiente |

## Distribución entre réplicas

NGINX conecta con el nombre de servicio Docker `api` y su resolución dinámica
de DNS para balancear las réplicas disponibles. Ambas comparten PostgreSQL y
Redis; la idempotencia distribuida depende de Redis compartido y del índice
único de pagos. Para inspeccionar el tráfico mientras corre k6:

```bash
docker compose -f docker-compose.yml -f docker-compose.k6.yml \
  --profile proxy logs --follow api
```

Al terminar:

```bash
docker compose -f docker-compose.yml -f docker-compose.k6.yml \
  --profile proxy down
```
