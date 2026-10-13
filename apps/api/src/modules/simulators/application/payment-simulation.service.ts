import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import { PaymentSettlementService } from '../../payments/application/use-cases/payment-settlement.service';

export type QrSimulationResult = 'APPROVED' | 'FAILED';

export interface PaymentSimulationResult {
  paymentId: string;
  status: string;
  changed: boolean;
}

@Injectable()
export class PaymentSimulationService {
  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    private readonly settlement: PaymentSettlementService,
    private readonly config: ConfigService,
  ) {}

  async simulate(
    tenantId: string,
    paymentId: string,
    result: QrSimulationResult,
    apiKeyEnvironment?: 'sandbox' | 'production',
  ): Promise<PaymentSimulationResult> {
    this.assertSimulationEnabled(apiKeyEnvironment);

    const payment = await this.tenantContext.withGlobalAccess((tx) =>
      tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          tenant_id: true,
          status: true,
          environment: true,
          expires_at: true,
          qr_payload: true,
          provider: { select: { payment_method: { select: { code: true } } } },
        },
      }),
    );

    if (!payment || payment.tenant_id !== tenantId) {
      throw new NotFoundException({
        code: 'payment_not_found',
        message: 'El pago solicitado no fue encontrado.',
      });
    }

    if (payment.environment !== 'sandbox') {
      throw new ForbiddenException({
        code: 'simulation_not_allowed',
        message: 'Solo se pueden simular pagos de ambiente sandbox.',
      });
    }

    if (payment.provider.payment_method.code !== 'qr' || !payment.qr_payload) {
      throw new ForbiddenException({
        code: 'simulation_not_allowed',
        message: 'Solo se pueden simular pagos QR.',
      });
    }

    if (payment.status !== 'pending') {
      return { paymentId, status: payment.status, changed: false };
    }

    if (payment.expires_at && payment.expires_at <= new Date()) {
      return { paymentId, status: payment.status, changed: false };
    }

    const settled =
      result === 'APPROVED'
        ? await this.settlement.approve(paymentId)
        : await this.settlement.reject(paymentId, 'processing_error');

    if (settled.outcome === 'changed') {
      return { paymentId, status: settled.status, changed: true };
    }

    const currentPayment = await this.tenantContext.withGlobalAccess((tx) =>
      tx.payment.findUnique({
        where: { id: paymentId },
        select: { tenant_id: true, status: true },
      }),
    );

    if (!currentPayment || currentPayment.tenant_id !== tenantId) {
      throw new NotFoundException({
        code: 'payment_not_found',
        message: 'El pago solicitado no fue encontrado.',
      });
    }

    return { paymentId, status: currentPayment.status, changed: false };
  }

  private assertSimulationEnabled(apiKeyEnvironment?: 'sandbox' | 'production'): void {
    const nodeEnvironment = this.config.get<string>('nodeEnv');
    if (
      this.config.get<boolean>('qrSimulatorsEnabled') !== true ||
      nodeEnvironment === 'production' ||
      apiKeyEnvironment === 'production'
    ) {
      throw new ForbiddenException({
        code: 'simulation_not_allowed',
        message: 'La simulación de pagos QR no está habilitada en producción.',
      });
    }
  }
}
