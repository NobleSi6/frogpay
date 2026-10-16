import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG } from './error-catalog';

export class IdempotencyInProgressError extends HttpException {
  readonly code = ERROR_CATALOG.idempotency_in_progress.code;
  readonly details: unknown;

  constructor(details?: unknown) {
    const resolvedDetails = details ?? null;
    super(
      {
        code: ERROR_CATALOG.idempotency_in_progress.code,
        message: ERROR_CATALOG.idempotency_in_progress.message,
        details: resolvedDetails,
      },
      ERROR_CATALOG.idempotency_in_progress.httpStatus,
    );
    this.name = IdempotencyInProgressError.name;
    this.details = resolvedDetails;
  }
}
