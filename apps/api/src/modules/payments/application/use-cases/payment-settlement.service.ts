import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PaymentProviderErrorCode } from '../../../provider-adapters/ports/payment-provider.port';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { calculatePaymentAmounts } from './payment-amount-calculator';

export type PaymentSettlementResult =
  | { outcome: 'changed'; paymentId: string; status: 'approved' | 'rejected' }
  | { outcome: 'unchanged'; paymentId: string; reason: 'not_found' | 'not_pending' };

@Injectable()
export class PaymentSettlementService {
  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  approve(paymentId: string): Promise<PaymentSettlementResult> {
    return this.settle(paymentId, 'approved');
  }

  reject(
    paymentId: string,
    errorCode: PaymentProviderErrorCode,
  ): Promise<PaymentSettlementResult> {
    return this.settle(paymentId, 'rejected', errorCode);
  }

  private settle(
    paymentId: string,
    status: 'approved' | 'rejected',
    errorCode?: PaymentProviderErrorCode,
  ): Promise<PaymentSettlementResult> {
    return this.tenantContext.withGlobalAccess(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          provider: { include: { payment_method: true } },
          tenant: { include: { plan: true } },
        },
      });

      if (!payment) return { outcome: 'unchanged', paymentId, reason: 'not_found' };
      if (payment.status !== 'pending') {
        return { outcome: 'unchanged', paymentId, reason: 'not_pending' };
      }

      const approvalTime = new Date();
      const isQrPayment = payment.provider.payment_method.code === 'qr';
      if (
        status === 'approved' &&
        isQrPayment &&
        payment.expires_at &&
        payment.expires_at <= approvalTime
      ) {
        return { outcome: 'unchanged', paymentId, reason: 'not_pending' };
      }

      const amounts = calculatePaymentAmounts(
        Number(payment.amount),
        Number(payment.tenant.plan?.commission_fixed ?? 0),
        Number(payment.tenant.plan?.commission_pct ?? 0),
      );
      const historyMetadata = errorCode ? { errorCode } : {};
      await tx.$executeRaw`
        SELECT set_config(
          'app.status_change_metadata',
          ${JSON.stringify(historyMetadata)},
          true
        )
      `;
      const changed = await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: 'pending',
          ...(status === 'approved' && isQrPayment
            ? { expires_at: { gt: approvalTime } }
            : {}),
        },
        data: {
          status,
          commission_amount: status === 'approved' ? amounts.commissionAmount : null,
          net_amount: status === 'approved' ? amounts.netAmount : null,
          error_code: status === 'rejected' ? errorCode : null,
          updated_at: new Date(),
        },
      });

      if (changed.count === 0) {
        return { outcome: 'unchanged', paymentId, reason: 'not_pending' };
      }

      let eventType: string;
      let payload: Prisma.InputJsonObject;
      if (status === 'approved') {
        eventType = 'pago.aprobado';
        payload = {
          paymentId,
          amount: String(payment.amount),
          currency: payment.currency.trim(),
          paymentMethod: payment.provider.payment_method.code,
          environment: payment.environment,
          merchantReference: payment.merchant_reference ?? '',
          commissionAmount: amounts.commissionAmount,
          netAmount: amounts.netAmount,
          providerTransactionId: payment.provider_transaction_id ?? null,
        };

        const period = new Date().toISOString().slice(0, 7);
        await tx.tenant_plan_usage.upsert({
          where: { tenant_id_period: { tenant_id: payment.tenant_id, period } },
          create: {
            tenant_id: payment.tenant_id,
            period,
            volume_used: Number(payment.amount),
            tx_count: 1,
          },
          update: {
            volume_used: { increment: Number(payment.amount) },
            tx_count: { increment: 1 },
          },
        });
      } else {
        eventType = 'pago.rechazado';
        payload = {
          paymentId,
          amount: String(payment.amount),
          currency: payment.currency.trim(),
          paymentMethod: payment.provider.payment_method.code,
          environment: payment.environment,
          merchantReference: payment.merchant_reference ?? '',
          errorCode: errorCode ?? 'processing_error',
        };
      }

      await tx.domain_event_outbox.create({
        data: {
          aggregate_type: 'payment',
          aggregate_id: paymentId,
          tenant_id: payment.tenant_id,
          event_type: eventType,
          payload,
        },
      });

      return { outcome: 'changed', paymentId, status };
    });
  }
}
