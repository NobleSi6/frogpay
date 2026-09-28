import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

type DatabaseRole = {
  current_user: string;
  bypass: boolean;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('DATABASE_URL'),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    try {
      const roles = await this.$queryRaw<DatabaseRole[]>`
        SELECT current_user, (rolsuper OR rolbypassrls) AS bypass
        FROM pg_roles
        WHERE rolname = current_user
      `;
      const role = roles[0];

      if (!role) {
        throw new Error('No fue posible identificar el rol de conexión.');
      }

      if (role.bypass) {
        throw new Error(
          'la aplicación se conectó con un rol que se salta RLS; usa frogpay_app',
        );
      }

      this.logger.log(`Conexión establecida con el rol ${role.current_user}.`);
    } catch (error) {
      await this.$disconnect();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}