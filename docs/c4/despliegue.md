# Diagrama de despliegue

Diagrama de referencia para desarrollo con Docker Compose. Los contenedores se
ejecutan en un host Docker; PostgreSQL puede ser el contenedor local o una
instancia gestionada accesible desde la red del host.

```mermaid
flowchart TB
    user["Usuarios / comercio<br/>navegador o servidor"]
    external["Stripe / sistemas bancarios"]

    subgraph host["Host de desarrollo — Docker Compose"]
        subgraph docker["Red privada de Compose"]
            nginx["nginx:1.28-alpine<br/>perfil proxy<br/>80 → 443 TLS"]
            dashboard["apps/dashboard<br/>Next.js dev<br/>3000"]
            api["apps/api<br/>NestJS dev<br/>4000"]
            postgres[("postgres:16-alpine<br/>5432")]
            redis[("redis:7-alpine<br/>6379")]
            rabbit[("rabbitmq:3-management-alpine<br/>5672 / 15672")]
            mailpit["axllent/mailpit<br/>SMTP 1025 / UI 8025"]
        end

        subgraph obs["Servicios opcionales — perfil observability"]
            otel["OTel Collector"]
            prom["Prometheus"]
            loki["Loki / Promtail"]
            tempo["Tempo"]
            grafana["Grafana"]
            alert["Alertmanager"]
        end
    end

    managedDB[("PostgreSQL gestionado<br/>alternativa al contenedor local")]

    user -->|"UI :3001"| dashboard
    user -->|"HTTPS :8443"| nginx
    nginx -->|"HTTP :3000"| dashboard
    nginx -->|"HTTP :4000"| api
    api --> postgres
    api --> redis
    api --> rabbit
    api --> mailpit
    api --> external
    api -. "si DATABASE_URL apunta a instancia gestionada" .-> managedDB
    api -. "OTLP" .-> otel
    prom -. "scrape /metrics" .-> api
    prom --> grafana
    loki --> grafana
    tempo --> grafana
    prom --> alert
```

En Compose, los puertos se publican solo donde lo indican los archivos
Compose: Dashboard `3001`, API por NGINX `8443` (y redirección HTTP `8080`),
Mailpit `8025`, RabbitMQ management `15672`, Grafana opcional `3002`,
Prometheus opcional `9090`, PostgreSQL local `127.0.0.1:5433`.

El TLS de NGINX cubre el salto desde el host al proxy. La red Docker usa HTTP,
AMQP y conexiones de base según configuración; el despliegue de producción debe
definir explícitamente cifrado de cada conexión y no hereda automáticamente
estas garantías del diagrama local.

Para el ensayo de escalado existe un override de carga con dos API replicas,
Redis compartido y NGINX resolviendo el servicio Docker `api`. Ese escenario es
de prueba y no significa que el Compose base despliegue dos réplicas.
