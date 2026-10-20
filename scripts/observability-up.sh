#!/usr/bin/env bash
set -euo pipefail

docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  -f docker-compose.rabbitmq-metrics.yml \
  --profile observability \
  up -d \
  rabbitmq \
  prometheus \
  loki \
  promtail \
  tempo \
  otel-collector \
  alert-receiver \
  alertmanager-config \
  alertmanager \
  grafana

echo "Observabilidad FrogPay iniciada."
echo "Grafana:    http://localhost:3002"
echo "Prometheus: http://localhost:9090"
echo "Loki:       http://localhost:3100"
echo "Tempo:      http://localhost:3200"
