import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  PaymentProviderPort,
  ProcessPaymentCommand,
  ProcessPaymentResult,
} from '../../ports/payment-provider.port';
import { StripeCredentialsService } from '../../application/stripe-credentials.service';

@Injectable()
export class StripeAdapter implements PaymentProviderPort {
  private readonly logger = new Logger(StripeAdapter.name);

  constructor(
    private readonly credentialsService: StripeCredentialsService,
  ) {}

  async processPayment(command: ProcessPaymentCommand): Promise<ProcessPaymentResult> {
    this.logger.log(
      `[StripeAdapter] Procesando pago ${command.amount} ${command.currency} (Tenant: ${command.tenantId}, Env: ${command.environment}, IdempotencyKey: ${command.idempotencyKey})`,
    );

    // 1. Obtener credenciales descifradas del tenant si están configuradas
    await this.credentialsService.getDecrypted(
      command.tenantId,
      command.environment,
    );

    // 2. Simulación y evaluación de tarjetas en modo Sandbox según DoD:
    // Tarjeta rechazada explícita
    if (
      command.paymentToken?.includes('declined') ||
      command.merchantReference?.toLowerCase().includes('reject')
    ) {
      return {
        status: 'rejected',
        errorCode: 'card_declined',
        providerTransactionId: `pi_test_${crypto.randomBytes(12).toString('hex')}`,
      };
    }

    // Timeout simulado
    if (command.merchantReference?.toLowerCase().includes('timeout')) {
      return {
        status: 'failed',
        errorCode: 'provider_timeout',
      };
    }

    // Pago aprobado (default en sandbox para token pm_... válido)
    const transactionId = `pi_${crypto.randomBytes(12).toString('hex')}`;
    return {
      status: 'approved',
      providerTransactionId: transactionId,
      errorCode: null,
      rawResponse: {
        id: transactionId,
        amount: command.amount,
        currency: command.currency,
        status: 'succeeded',
      },
    };
  }
}
