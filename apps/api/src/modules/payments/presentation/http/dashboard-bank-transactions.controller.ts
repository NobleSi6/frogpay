import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';

export class GetBankTransactionsQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiProperty({
    required: false,
    enum: [
      'reconciled',
      'amount_mismatch',
      'currency_mismatch',
      'unmatched',
      'reference_not_found',
    ],
  })
  @IsOptional()
  @IsIn([
    'reconciled',
    'amount_mismatch',
    'currency_mismatch',
    'unmatched',
    'reference_not_found',
  ])
  status?: string;

  @ApiProperty({ required: false, description: 'Fecha inicial (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, description: 'Fecha final (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class BankTransactionItemDto {
  @ApiProperty({ example: '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391' })
  id!: string;

  @ApiProperty({ example: 'BT-2026-A81F92' })
  reference!: string;

  @ApiProperty({ example: '150.00' })
  amount!: string;

  @ApiProperty({ example: 'BOB' })
  currency!: string;

  @ApiProperty({ example: 'Banco de Prueba' })
  bankName!: string;

  @ApiProperty({ example: '2026-10-11T20:05:00.000Z' })
  receivedAt!: string;

  @ApiProperty({
    example: 'reconciled',
    enum: ['reconciled', 'amount_mismatch', 'currency_mismatch', 'unmatched'],
  })
  status!: string;

  @ApiProperty({
    example: '7b3c9a12-e2fb-5a84-c0af-75d618fe8402',
    nullable: true,
  })
  paymentId!: string | null;

  @ApiProperty({ example: '2026-10-11T20:05:01.000Z' })
  createdAt!: string;
}

export class PaginatedBankTransactionsResponseDto {
  @ApiProperty({ type: [BankTransactionItemDto] })
  data!: BankTransactionItemDto[];

  @ApiProperty({
    example: {
      total: 45,
      page: 1,
      limit: 20,
      totalPages: 3,
    },
  })
  pagination!: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@ApiTags('Dashboard BFF - Transacciones Bancarias (TSK-BANK-304)')
@ApiBearerAuth()
@Controller('dashboard/bank-transactions')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
export class DashboardBankTransactionsController {
  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar depósitos y transacciones bancarias para conciliación (TSK-BANK-304)',
    description:
      'Devuelve los depósitos bancarios registrados para el tenant autenticado, con paginación y filtros por estado y fecha.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de depósitos recuperada exitosamente.',
    type: PaginatedBankTransactionsResponseDto,
  })
  async listTransactions(
    @CurrentTenantContext() context: AuthenticatedTenantContext,
    @Query() query: GetBankTransactionsQueryDto,
  ): Promise<PaginatedBankTransactionsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    return this.tenantContext.withTenant(context.tenantId, async (tx) => {
      const where: Record<string, unknown> = {
        tenant_id: context.tenantId,
      };

      if (query.status) {
        const mappedStatus =
          query.status === 'reference_not_found' ? 'unmatched' : query.status;
        where.status = mappedStatus;
      }

      if (query.from || query.to) {
        where.received_at = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }

      const [total, transactions] = await Promise.all([
        tx.bank_transaction.count({ where }),
        tx.bank_transaction.findMany({
          where,
          skip,
          take: limit,
          orderBy: { received_at: 'desc' },
        }),
      ]);

      const data: BankTransactionItemDto[] = transactions.map((t) => ({
        id: t.id,
        reference: t.reference,
        amount: String(t.amount),
        currency: t.currency.trim(),
        bankName: t.bank_name,
        receivedAt: t.received_at.toISOString(),
        status: t.status,
        paymentId: t.payment_id ?? null,
        createdAt: t.created_at.toISOString(),
      }));

      return {
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    });
  }
}
