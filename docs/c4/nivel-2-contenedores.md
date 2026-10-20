# C4 nivel 2 — Contenedores

```mermaid
flowchart LR
    browser["Navegador"]
    merchantServer["Backend del comercio"]

    subgraph platform["FrogPay"]
        proxy["NGINX<br/>Proxy TLS 1.2/1.3<br/>puertos 8080 / 8443"]
        web["Dashboard<br/>Next.js<br/>puerto 3000 en Docker"]
        api["FrogPay API<br/>NestJS modular<br/>puerto 4000 en Docker"]
        db[("PostgreSQL<br/>Prisma + RLS")]
        redis[("Redis<br/>Idempotencia / rate limit / caché")]
        broker[("RabbitMQ<br/>Eventos, colas y DLQ")]
        mail["Mailpit / SMTP<br/>correo de desarrollo"]
        subgraph telemetry["Perfil opcional observability"]
            collector["OpenTelemetry Collector"]
            prometheus["Prometheus"]
            grafana["Grafana"]
            loki["Loki + Promtail"]
            tempo["Tempo"]
            alertmanager["Alertmanager"]
        end
    end

    stripe["Stripe"]
    bank["Banco / QR<br/>adapter local del MVP"]

    browser -->|"HTTPS UI :3001"| web
    browser -->|"HTTPS API :8443"| proxy
    merchantServer -->|"HTTPS API"| proxy
    proxy -->|"HTTP :3000<br/>red Docker"| web
    proxy -->|"HTTP :4000<br/>red Docker"| api
    web -->|"REST /api/*"| api
    api -->|"SQL / transacciones<br/>tenant context + RLS"| db
    api -->|"locks y caché"| redis
    api -->|"Transactional Outbox"| db
    api -->|"AMQP"| broker
    broker -->|"Consumidores de módulos"| api
    api -->|"SMTP"| mail
    api -->|"HTTPS"| stripe
    api -->|"Adapter local"| bank
    api -->|"OTLP"| collector
    collector --> tempo
    prometheus -->|"scrape /metrics"| api
    grafana --> prometheus
    grafana --> loki
    grafana --> tempo
    prometheus --> alertmanager
```

**Límites de red:** Compose publica Dashboard en `localhost:3001`, Mailpit en
`localhost:8025`, RabbitMQ management en `localhost:15672` y Redis en
`localhost:6379`. PostgreSQL local se publica solo en `127.0.0.1:5433`.
La API no publica `4000` al host en el Compose normal; el navegador accede a la
API a través de NGINX en `https://localhost:8443` con el perfil `proxy`.

El perfil `observability` se define en `docker-compose.observability.yml` y
agrega Grafana (`localhost:3002`), Prometheus (`localhost:9090`), Loki,
Tempo, collector y Alertmanager. Su habilitación requiere ambas definiciones
Compose y una contraseña local para Grafana.
