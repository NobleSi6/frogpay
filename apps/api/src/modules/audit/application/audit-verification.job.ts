import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit.service';

@Injectable()
export class AuditVerificationJob
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuditVerificationJob.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('audit.verificationJobEnabled', false))
      return;
    const seconds = this.config.get<number>(
      'audit.verificationIntervalSeconds',
      86400,
    );
    this.timer = setInterval(() => void this.run(), seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const results = await this.audit.verifyAllTenants();
      for (const result of results.filter(({ valid }) => !valid)) {
        this.logger.error(
          `Cadena de auditoría inválida para tenant ${result.tenantId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Falló la verificación periódica: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
}
