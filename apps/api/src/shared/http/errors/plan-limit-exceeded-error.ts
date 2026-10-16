import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG } from './error-catalog';

export class PlanLimitExceededError extends HttpException {
  readonly code = ERROR_CATALOG.plan_limit_exceeded.code;
  readonly details: unknown;

  constructor(details?: unknown) {
    const resolvedDetails = details ?? null;
    super(
      {
        code: ERROR_CATALOG.plan_limit_exceeded.code,
        message: ERROR_CATALOG.plan_limit_exceeded.message,
        details: resolvedDetails,
      },
      ERROR_CATALOG.plan_limit_exceeded.httpStatus,
    );
    this.name = PlanLimitExceededError.name;
    this.details = resolvedDetails;
  }
}
