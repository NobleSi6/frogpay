# FrogPay observability (local development)

This Compose overlay adds Prometheus, Grafana, Loki, Promtail, Tempo, and the
OpenTelemetry Collector without changing the default services in
`docker-compose.yml`.

1. Set `GRAFANA_ADMIN_PASSWORD` to a strong local value in the root `.env`.
   Do not commit `.env` or real credentials. By default, Alertmanager sends
   notifications to the local `alert-receiver` service, which logs alert
   names, severities, components, and summaries to its container output. To use a
   different HTTP(S) receiver, set `ALERTMANAGER_WEBHOOK_URL` in `.env`. A
   one-shot container renders Alertmanager's configuration into a private
   Docker volume, not into a repository file.
2. Start the observability profile from the repository root with
   `./scripts/observability-up.sh`. Prometheus sends firing and resolved alerts
   to Alertmanager, which forwards them to the configured webhook. The overlay
   also enables RabbitMQ's Prometheus plugin.
3. `nest-cli.json` selects `src/bootstrap.ts` as the Nest entry point. The
   bootstrap loads the tracing SDK before importing Nest's `main.ts`, including
   in watch mode. Build and start it on the host with structured JSON logging:
   `cd apps/api && npm run build && npm run start:dev`.
   The default host-run OTLP trace endpoint is
   `http://localhost:4318/v1/traces`.

Prometheus scrapes a host-run API at `host.docker.internal:4000`. If the API
instead runs as a Compose service, change that target to `api:4000`.

Promtail reads Docker container logs through the Docker socket and does not
collect logs from an API process started directly in a terminal unless it
writes to the configured log file. The structured logger writes NestJS JSON output to
`apps/api/logs/frogpay.jsonl`, which Promtail tails. Access to the Docker socket is highly privileged; use this
single-host setup only in a controlled development environment. Promtail is
included to match the sprint scope, but Grafana Alloy should be considered for
maintained log collection.

The local alert receiver is intended for development and does not persist
notifications or authenticate callers. It is only reachable on the internal
Compose network and does not publish a host port.

The outbox gauges are refreshed every 15 seconds through the tenant-context
service's global access path. `frogpay_outbox_metrics_available` identifies a
failed refresh so stale values are not mistaken for current data. Circuit
breaker state is exported with `provider` and `state` labels. Payment,
provider-call, webhook-delivery, and DLQ metrics are wired to their payment,
provider, webhook, and RabbitMQ queue paths. RabbitMQ's native metrics remain
scraped as an additional diagnostic source.

All observability UIs and OTLP host ports are bound to loopback. This is a
local development configuration, not a production deployment profile.
