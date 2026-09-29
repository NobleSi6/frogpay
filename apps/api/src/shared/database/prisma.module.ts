import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service';
import { PrismaTenantContextService } from './prisma-tenant-context.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, PrismaTenantContextService, DatabaseHealthService],
  exports: [PrismaTenantContextService, DatabaseHealthService],
})
export class PrismaModule {}
