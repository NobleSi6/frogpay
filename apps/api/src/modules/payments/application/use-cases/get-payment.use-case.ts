import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import {
  GetPaymentResponseDto,
  PaymentTransitionDto,
  PaymentStatusHistoryItemDto,
} from '../dto/get-payment-response.dto';
import {
  BankInstructionsDto,
  PaymentStatus,
} from '../dto/payment-response.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class GetPaymentUseCase {
  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  async execute(tenantId: string, paymentId: string): Promise<GetPaymentResponseDto> {
    return this.tenantContext.withTenant(tenantId, async (tx) => {
      const payment = await tx.payment.findUnique({
        where: {
          id_tenant_id: {
            id: paymentId,
            tenant_id: tenantId,
          },
        },
        include: {
          provider: {
            include: {
              payment_method: true,
            },
          },
          payment_status_history: {
            orderBy: { created_at: 'asc' },
          },
        },
      });

      if (!payment) {
        throw new NotFoundException({
          code: 'payment_not_found',
          message: 'El pago solicitado no fue encontrado.',
          details: null,
        });
      }

      const isPending = payment.status === 'pending';

      const transitions: PaymentTransitionDto[] = payment.payment_status_history.map((history) => {
        const metadata =
          history.metadata && typeof history.metadata === 'object' && !Array.isArray(history.metadata)
            ? (history.metadata as Record<string, unknown>)
            : {};

        let actor = 'system';
        if (typeof metadata.actor === 'string' && metadata.actor) {
          actor = metadata.actor;
        } else if (history.previous_status === 'pending' && history.new_status === 'approved') {
          actor = 'webhook';
        } else if (metadata.depositId || metadata.reference) {
          actor = 'webhook';
        }

        return {
          from: history.previous_status ?? null,
          to: history.new_status,
          createdAt: history.created_at.toISOString(),
          actor,
        };
      });

      const statusHistory: PaymentStatusHistoryItemDto[] = payment.payment_status_history.map((history) => ({
        previousStatus: history.previous_status ?? null,
        newStatus: history.new_status,
        metadata:
          history.metadata && typeof history.metadata === 'object' && !Array.isArray(history.metadata)
            ? (history.metadata as Record<string, unknown>)
            : {},
        createdAt: history.created_at.toISOString(),
      }));

      return {
        id: payment.id,
        status: payment.status as PaymentStatus,
        amount: String(payment.amount),
        currency: payment.currency.trim(),
        paymentMethod: payment.provider.payment_method.code,
        environment: payment.environment === 'production' ? 'production' : 'sandbox',
        merchantReference: payment.merchant_reference ?? '',
        commissionAmount: payment.commission_amount ? String(payment.commission_amount) : null,
        netAmount: payment.net_amount ? String(payment.net_amount) : null,
        providerTransactionId: payment.provider_transaction_id ?? null,
        errorCode: payment.error_code ?? null,
        // Solo disponibles mientras el pago esté pendiente
        qrPayload: isPending ? (payment.qr_payload ?? null) : null,
        bankInstructions: isPending ? toBankInstructions(payment.bank_instructions) : null,
        createdAt: payment.created_at.toISOString(),
        updatedAt: payment.updated_at.toISOString(),
        expiresAt: payment.expires_at ? payment.expires_at.toISOString() : null,
        transitions,
        statusHistory,
      };
    });
  }
}

function toBankInstructions(value: Prisma.JsonValue): BankInstructionsDto | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const { bankName, accountNumber, accountHolder, amount, currency, reference } = value;
  if (
    typeof bankName !== 'string' ||
    typeof accountNumber !== 'string' ||
    typeof accountHolder !== 'string' ||
    typeof amount !== 'string' ||
    typeof currency !== 'string' ||
    typeof reference !== 'string'
  ) {
    return null;
  }

  return { bankName, accountNumber, accountHolder, amount, currency, reference };
}
