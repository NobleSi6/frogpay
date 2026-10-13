import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { PaymentProviderRegistry } from '../../../provider-adapters/registry/payment-provider.registry';
import type { ProviderResult } from '../../../provider-adapters/ports/payment-provider.port';
import {
  PROVIDER_RETRY_SCHEDULER,
  ProviderRetryMessage,
  ProviderRetryScheduler,
  RETRYABLE_PROVIDER_ERRORS,
} from '../ports/provider-retry-scheduler.port';
import { PaymentSettlementService } from './payment-settlement.service';

export type RetryOutcome = 'skipped' | 'pending_confirmation' | 'approved' | 'rejected' | 'retry_scheduled' | 'dead_lettered';

/**
 * Reintenta la autorización de un pago asíncrono (QR) cuyo proveedor estaba
 * caído (TSK-DEV2-305). Con éxito, el pago sigue su flujo normal (QR generado y
 * pendiente de confirmación); al agotar los reintentos se rechaza con
 * provider_unavailable, se emite pago.rechazado y el mensaje va a la DLQ de pagos.
 */
@Injectable()
export class RetryProviderAuthorizationUseCase {
  private readonly logger = new Logger(RetryProviderAuthorizationUseCase.name);

  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    @Inject(PaymentProviderRegistry) private readonly providers: Pick<PaymentProviderRegistry, 'resolve'>,
    private readonly settlement: PaymentSettlementService,
    @Inject(PROVIDER_RETRY_SCHEDULER) private readonly scheduler: ProviderRetryScheduler,
  ) {}

  async execute(message: ProviderRetryMessage): Promise<RetryOutcome> {
    const payment = await this.tenantContext.withGlobalAccess((tx) =>
      tx.payment.findUnique({
        where: { id: message.paymentId },
        select: { status: true, provider_transaction_id: true },
      }),
    );
    // Solo se reintenta un pago que sigue pendiente y que el proveedor nunca aceptó.
    if (!payment || payment.status !== 'pending' || payment.provider_transaction_id) return 'skipped';

    let result: ProviderResult;
    try {
      result = await this.providers.resolve(message.paymentMethod).authorize({
        amount: message.amount,
        currency: message.currency,
        paymentToken: '',
        idempotencyKey: message.idempotencyKey,
      });
    } catch (error) {
      this.logger.warn(`Reintento ${message.attempt} del pago ${message.paymentId} lanzó un error: ${String(error)}`);
      result = { outcome: 'error', errorCode: 'provider_unavailable' };
    }

    if (result.outcome === 'pending' || result.outcome === 'approved') {
      await this.tenantContext.withTenant(message.tenantId, (tx) =>
        tx.payment.updateMany({
          where: { id: message.paymentId, tenant_id: message.tenantId, status: 'pending' },
          data: {
            provider_transaction_id: result.providerTransactionId ?? null,
            qr_payload: result.qrPayload ?? null,
            expires_at: result.expiresAt ?? null,
            error_code: null,
            updated_at: new Date(),
          },
        }),
      );
      if (result.outcome === 'approved') {
        await this.settlement.approve(message.paymentId);
        return 'approved';
      }
      this.logger.log(`Pago ${message.paymentId} enviado al proveedor en el reintento ${message.attempt}`);
      return 'pending_confirmation';
    }

    const errorCode = result.errorCode ?? (result.outcome === 'timeout' ? 'provider_timeout' : 'provider_unavailable');
    if (result.outcome === 'declined' || !RETRYABLE_PROVIDER_ERRORS.includes(errorCode)) {
      await this.settlement.reject(message.paymentId, result.errorCode ?? 'processing_error');
      return 'rejected';
    }

    const delay = this.scheduler.delaysMs[message.attempt - 1];
    if (delay !== undefined) {
      await this.scheduler.schedule({ ...message, attempt: message.attempt + 1 }, delay);
      this.logger.warn(
        `Proveedor no disponible para el pago ${message.paymentId} (intento ${message.attempt}); siguiente intento en ${delay / 1000} s`,
      );
      return 'retry_scheduled';
    }

    await this.settlement.reject(message.paymentId, 'provider_unavailable');
    await this.scheduler.deadLetter({ ...message, reason: errorCode, failedAt: new Date().toISOString() });
    this.logger.error(`Pago ${message.paymentId} rechazado tras ${message.attempt} intentos: proveedor no disponible (DLQ)`);
    return 'dead_lettered';
  }
}
