import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG } from './error-catalog';

export class ValidationError extends HttpException {
  readonly code = ERROR_CATALOG.validation_error.code;
  readonly details: unknown;

  constructor(details?: unknown) {
    const resolvedDetails = details ?? null;
    super(
      {
        code: ERROR_CATALOG.validation_error.code,
        message: ERROR_CATALOG.validation_error.message,
        details: resolvedDetails,
      },
      ERROR_CATALOG.validation_error.httpStatus,
    );
    this.name = ValidationError.name;
    this.details = resolvedDetails;
  }
}
