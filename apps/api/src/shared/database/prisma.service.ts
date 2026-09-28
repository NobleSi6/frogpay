import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    const [row] = await this.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    this.logger.log(`Conectado a Supabase ✔ (hora del servidor BD: ${row.now.toISOString()})`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
