import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service.js';
import { PrismaTenantContextService } from './prisma-tenant-context.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, PrismaTenantContextService, DatabaseHealthService],
  exports: [PrismaTenantContextService, DatabaseHealthService],
})
export class PrismaModule {}