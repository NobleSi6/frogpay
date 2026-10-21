import { Injectable } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpRequests = new Counter({
    name: 'frogpay_http_requests_total',
    help: 'Total de solicitudes HTTP',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'frogpay_http_request_duration_seconds',
    help: 'Duracion de solicitudes HTTP',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [
      0.005, 0.01, 0.025, 0.05,
      0.1, 0.2, 0.3, 0.5, 1, 2, 5,
    ],
    registers: [this.registry],
  });

  readonly payments = new Counter({
    name: 'frogpay_payments_total',
    help: 'Pagos procesados por estado y metodo',
    labelNames: ['status', 'method'],
    registers: [this.registry],
  });

  readonly providerCalls = new Counter({
    name: 'frogpay_provider_calls_total',
    help: 'Llamadas a proveedores de pago',
    labelNames: ['provider', 'status'],
    registers: [this.registry],
  });

  readonly circuitBreaker = new Gauge({
    name: 'frogpay_circuit_breaker_state',
    help: 'Estado activo del circuito por proveedor',
    labelNames: ['provider', 'state'],
    registers: [this.registry],
  });

  readonly outboxPending = new Gauge({
    name: 'frogpay_outbox_pending_events',
    help: 'Eventos pendientes del outbox',
    registers: [this.registry],
  });

  readonly outboxOldestPendingAge = new Gauge({
    name: 'frogpay_outbox_oldest_pending_age_seconds',
    help: 'Antiguedad del evento pendiente mas antiguo del outbox',
    registers: [this.registry],
  });

  readonly outboxMetricsAvailable = new Gauge({
    name: 'frogpay_outbox_metrics_available',
    help: 'Indica si las metricas del outbox se pudieron consultar',
    registers: [this.registry],
  });

  readonly webhookDeliveries = new Counter({
    name: 'frogpay_webhook_deliveries_total',
    help: 'Intentos de entrega de webhooks',
    labelNames: ['status'],
    registers: [this.registry],
  });

  readonly dlqMessages = new Gauge({
    name: 'frogpay_dlq_messages',
    help: 'Mensajes pendientes por cola dead-letter',
    labelNames: ['queue'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'frogpay_',
    });
  }

  recordHttp(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method,
      route,
      status_code: String(statusCode),
    };

    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  recordPayment(status: string, method: string): void {
    this.payments.inc({ status, method });
  }

  recordProviderCall(
    provider: string,
    status: string,
  ): void {
    this.providerCalls.inc({ provider, status });
  }

  setCircuitState(
    provider: string,
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
  ): void {
    for (const candidate of ['CLOSED', 'OPEN', 'HALF_OPEN'] as const) {
      this.circuitBreaker.set(
        { provider, state: candidate },
        candidate === state ? 1 : 0,
      );
    }
  }

  setOutboxPending(
    count: number,
    oldestPendingAgeSeconds: number,
  ): void {
    this.outboxPending.set(count);
    this.outboxOldestPendingAge.set(oldestPendingAgeSeconds);
    this.outboxMetricsAvailable.set(1);
  }

  setOutboxMetricsUnavailable(): void {
    this.outboxMetricsAvailable.set(0);
  }

  recordWebhookDelivery(status: string): void {
    this.webhookDeliveries.inc({ status });
  }

  setDlqMessages(queue: string, count: number): void {
    this.dlqMessages.set({ queue }, Math.max(0, count));
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
