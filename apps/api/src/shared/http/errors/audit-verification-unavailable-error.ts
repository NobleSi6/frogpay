import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG } from './error-catalog';

export class AuditVerificationUnavailableError extends HttpException {
  readonly code = ERROR_CATALOG.audit_verification_unavailable.code;
  readonly details: null = null;

  constructor() {
    super(
      {
        code: ERROR_CATALOG.audit_verification_unavailable.code,
        message: ERROR_CATALOG.audit_verification_unavailable.message,
        details: null,
      },
      ERROR_CATALOG.audit_verification_unavailable.httpStatus,
    );
    this.name = AuditVerificationUnavailableError.name;
  }
}
