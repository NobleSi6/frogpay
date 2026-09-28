import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { InvalidTenantContextError } from './invalid-tenant-context.error.js';
import { PrismaService } from './prisma.service.js';

export type TenantTx = Prisma.TransactionClient;

@Injectable()
export class PrismaTenantContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async withTenant<T>(
    tenantId: string,
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    if (!isUUID(tenantId)) {
      throw new InvalidTenantContextError();
    }

    return this.withContext(tenantId, 'false', fn);
  }

  withGlobalAccess<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.withContext('', 'true', fn);
  }

  private withContext<T>(
    tenantId: string,
    globalAccess: 'true' | 'false',
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    const timeout = this.configService.getOrThrow<number>(
      'PRISMA_TX_TIMEOUT_MS',
    );
    const maxWait = this.configService.getOrThrow<number>(
      'PRISMA_TX_MAX_WAIT_MS',
    );

    return this.prisma.$transaction(
      async (tx: TenantTx) => {
        await tx.$queryRaw`
          SELECT
            set_config('app.current_tenant_id', ${tenantId}, true),
            set_config('app.global_access', ${globalAccess}, true)
        `;

        // Dentro de fn solo se permiten queries a la BD; no llamadas HTTP ni externas.
        return fn(tx);
      },
      { timeout, maxWait },
    );
  }
}