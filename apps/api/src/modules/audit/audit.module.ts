import { Global, Module } from '@nestjs/common';
import { AuditEventHandler } from './application/audit-event.handler';
import { AuditService } from './application/audit.service';
import { AuditVerificationJob } from './application/audit-verification.job';
import { AuditController } from './presentation/http/audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditEventHandler, AuditVerificationJob],
  exports: [AuditService],
})
export class AuditModule {}
