import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG } from './error-catalog';

export class IdempotencyKeyReusedError extends HttpException {
  readonly code = ERROR_CATALOG.idempotency_key_reused.code;
  readonly details: unknown;

  constructor(details?: unknown) {
    const resolvedDetails = details ?? null;
    super(
      {
        code: ERROR_CATALOG.idempotency_key_reused.code,
        message: ERROR_CATALOG.idempotency_key_reused.message,
        details: resolvedDetails,
      },
      ERROR_CATALOG.idempotency_key_reused.httpStatus,
    );
    this.name = IdempotencyKeyReusedError.name;
    this.details = resolvedDetails;
  }
}
