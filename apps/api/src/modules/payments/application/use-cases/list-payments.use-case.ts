import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import {
  ListPaymentsQueryDto,
  ListPaymentsResponseDto,
} from '../dto/list-payments.dto';
import {
  PaymentResponseDto,
  PaymentStatus,
} from '../dto/payment-response.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ListPaymentsUseCase {
  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  async execute(
    tenantId: string,
    query: ListPaymentsQueryDto,
  ): Promise<ListPaymentsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;

    return this.tenantContext.withTenant(tenantId, async (tx) => {
      // tenant_id SIEMPRE forma parte inamovible de la cláusula WHERE para garantizar aislamiento
      const where: Prisma.paymentWhereInput = {
        tenant_id: tenantId,
      };

      if (query.status) {
        where.status = query.status;
      }

      if (query.environment) {
        where.environment = query.environment;
      }

      if (query.paymentMethod) {
        where.provider = {
          payment_method: {
            code: query.paymentMethod,
          },
        };
      }

      if (query.from || query.to) {
        where.created_at = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}), // 'to' es exclusivo según contrato
        };
      }

      if (query.search && query.search.trim()) {
        const term = query.search.trim();
        const searchConditions: Prisma.paymentWhereInput[] = [
          { merchant_reference: { contains: term, mode: 'insensitive' } },
        ];

        if (isUUID(term)) {
          searchConditions.push({ id: term });
        }

        where.OR = searchConditions;
      }

      // Orden dinámico indexado
      const orderBy: Prisma.paymentOrderByWithRelationInput = {};
      const orderDir = query.sortOrder === 'asc' ? 'asc' : 'desc';

      if (query.sortBy === 'amount') {
        orderBy.amount = orderDir;
      } else if (query.sortBy === 'status') {
        orderBy.status = orderDir;
      } else {
        orderBy.created_at = orderDir;
      }

      // Concurrencia de conteo y obtención de páginas con índices activos
      const [total, payments] = await Promise.all([
        tx.payment.count({ where }),
        tx.payment.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            provider: {
              include: {
                payment_method: true,
              },
            },
          },
        }),
      ]);

      const data: PaymentResponseDto[] = payments.map((p) => {
        const isPending = p.status === 'pending';
        return {
          id: p.id,
          status: p.status as PaymentStatus,
          amount: String(p.amount),
          currency: p.currency.trim(),
          paymentMethod: p.provider.payment_method.code,
          environment: p.environment === 'production' ? 'production' : 'sandbox',
          merchantReference: p.merchant_reference ?? '',
          commissionAmount: p.commission_amount
            ? String(p.commission_amount)
            : null,
          netAmount: p.net_amount ? String(p.net_amount) : null,
          providerTransactionId: p.provider_transaction_id ?? null,
          errorCode: p.error_code ?? null,
          expiresAt: p.expires_at ? p.expires_at.toISOString() : null,
          qrPayload: isPending ? (p.qr_payload ?? null) : null,
          createdAt: p.created_at.toISOString(),
          updatedAt: p.updated_at.toISOString(),
        };
      });

      return {
        data,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      };
    });
  }
}
