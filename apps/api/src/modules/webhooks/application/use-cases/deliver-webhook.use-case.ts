import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { currentRequestId } from '../../../../shared/observability/request-context';
import { currentTraceparent } from '../../../../shared/observability/trace-propagation';
import { MetricsService } from '../../../observability/metrics.service';
import {
  isSuccessfulStatus,
  nextRetryDelayMs,
  WEBHOOK_MAX_ATTEMPTS,
} from '../../domain/retry-policy';
import {
  buildSignatureHeader,
  SIGNATURE_HEADER,
} from '../../domain/webhook-signature';
import { WebhookHttpClient } from '../../infrastructure/http/webhook-http.client';
import {
  WebhookDispatchMessage,
  WebhookDispatchQueue,
} from '../../infrastructure/messaging/webhook-dispatch.queue';
import { WebhookDeliveryRepository } from '../../infrastructure/persistence/webhook-delivery.repository';
import {
  WEBHOOK_SECRET_CIPHER,
  WebhookSecretCipher,
} from '../ports/webhook-secret-cipher.port';

export type DeliverOutcome =
  'delivered' | 'retry_scheduled' | 'failed' | 'skipped';

/**
 * Ejecuta un intento de entrega (TSK-DEV2-301 y TSK-DEV2-302):
 * firma el cuerpo con HMAC-SHA256, lo envía con timeout de 3 s, registra el
 * intento y decide: entregado, reintento con backoff o fallo definitivo + DLQ.
 */
@Injectable()
export class DeliverWebhookUseCase {
  private readonly logger = new Logger(DeliverWebhookUseCase.name);

  constructor(
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly http: WebhookHttpClient,
    private readonly queue: WebhookDispatchQueue,
    @Inject(WEBHOOK_SECRET_CIPHER) private readonly cipher: WebhookSecretCipher,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async execute(message: WebhookDispatchMessage): Promise<DeliverOutcome> {
    const claimed = await this.deliveries.claimAttempt(
      message.deliveryId,
      message.attempt,
    );
    if (!claimed) return 'skipped'; // mensaje repetido o entrega ya resuelta

    const delivery = await this.deliveries.loadForDispatch(message.deliveryId);
    if (!delivery) return 'skipped';

    const base = {
      deliveryId: delivery.id,
      tenantId: delivery.tenantId,
      attemptNumber: message.attempt,
    };

    if (!delivery.webhook.usable) {
      await this.deliveries.recordAttempt(
        {
          ...base,
          responseCode: null,
          error: 'El endpoint está desactivado o fue eliminado',
          durationMs: 0,
          succeeded: false,
        },
        { kind: 'failed' },
      );
      this.metrics?.recordWebhookDelivery('failed');
      return 'failed';
    }

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = this.cipher.decrypt(delivery.webhook.secretEncrypted);
    const traceparent = currentTraceparent();
    const requestId = currentRequestId();
    const result = await this.http.send({
      url: delivery.webhook.url,
      body,
      headers: {
        [SIGNATURE_HEADER]: buildSignatureHeader(secret, timestamp, body),
        'FrogPay-Event-Id': delivery.eventId ?? delivery.payload.eventId,
        'FrogPay-Event': delivery.eventType,
        'FrogPay-Delivery-Id': delivery.id,
        'FrogPay-Attempt': String(message.attempt),
        'User-Agent': 'FrogPay-Webhooks/1.0',
        ...(traceparent ? { traceparent } : {}),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
    });

    const succeeded = isSuccessfulStatus(result.status);
    const error = succeeded
      ? null
      : (result.error ?? `El endpoint respondió HTTP ${result.status}`);
    const attempt = {
      ...base,
      responseCode: result.status,
      error,
      durationMs: result.durationMs,
      succeeded,
    };

    if (succeeded) {
      await this.deliveries.recordAttempt(attempt, { kind: 'delivered' });
      this.metrics?.recordWebhookDelivery('delivered');
      this.logger.log(
        `Webhook ${delivery.id} entregado en el intento ${message.attempt} (HTTP ${result.status})`,
      );
      return 'delivered';
    }

    const delay = message.manual ? null : nextRetryDelayMs(message.attempt);
    if (delay !== null && message.attempt < WEBHOOK_MAX_ATTEMPTS) {
      await this.deliveries.recordAttempt(attempt, {
        kind: 'retry',
        nextRetryAt: new Date(Date.now() + delay),
      });
      await this.queue.enqueue(
        { deliveryId: delivery.id, attempt: message.attempt + 1 },
        delay,
      );
      this.metrics?.recordWebhookDelivery('retry');
      this.logger.warn(
        `Webhook ${delivery.id} falló (intento ${message.attempt}): ${error}. Reintento en ${delay / 1000} s`,
      );
      return 'retry_scheduled';
    }

    await this.deliveries.recordAttempt(attempt, { kind: 'failed' });
    await this.queue.sendToDeadLetter({
      deliveryId: delivery.id,
      tenantId: delivery.tenantId,
      webhookId: delivery.webhookId,
      eventId: delivery.eventId,
      eventName: delivery.eventType,
      attempts: message.attempt,
      lastError: error,
      failedAt: new Date().toISOString(),
    });
    this.metrics?.recordWebhookDelivery('failed');
    this.logger.error(
      `Webhook ${delivery.id} enviado a la DLQ tras ${message.attempt} intentos: ${error}`,
    );
    return 'failed';
  }
}
