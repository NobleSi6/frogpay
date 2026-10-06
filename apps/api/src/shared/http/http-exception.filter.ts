import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ERROR_CATALOG } from './errors/error-catalog';
import { IdempotencyInProgressError } from './errors/idempotency-in-progress-error';
import { IdempotencyKeyReusedError } from './errors/idempotency-key-reused-error';
import { PlanLimitExceededError } from './errors/plan-limit-exceeded-error';
import { ValidationError } from './errors/validation-error';
import { RequestWithId } from './middleware/request-id.middleware';

type CatalogException =
  | ValidationError
  | IdempotencyInProgressError
  | IdempotencyKeyReusedError
  | PlanLimitExceededError;

type ErrorPayload = {
  code: string;
  message: string;
  details: unknown;
  requestId: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const requestId = request.requestId ?? randomUUID();

    let status = 500;
    let payload: ErrorPayload;

    if (this.isCatalogException(exception)) {
      status = exception.getStatus();
      payload = {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
      };
      this.logger.warn(`${exception.code}: ${exception.message} (requestId=${requestId})`);
    } else if (exception instanceof BadRequestException) {
      const exceptionResponse = exception.getResponse();
      const details =
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
          ? exceptionResponse.message
          : exceptionResponse;

      status = ERROR_CATALOG.validation_error.httpStatus;
      payload = {
        code: ERROR_CATALOG.validation_error.code,
        message: ERROR_CATALOG.validation_error.message,
        details: details ?? null,
        requestId,
      };
    } else {
      payload = {
        code: 'internal_error',
        message: 'Error interno del servidor',
        details: null,
        requestId,
      };
      const errorDescription =
        exception instanceof Error
          ? `${exception.name}: ${exception.message}`
          : String(exception);
      this.logger.error(
        `Unhandled exception (requestId=${requestId}): ${errorDescription}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(payload);
  }

  private isCatalogException(exception: unknown): exception is CatalogException {
    return (
      exception instanceof ValidationError ||
      exception instanceof IdempotencyInProgressError ||
      exception instanceof IdempotencyKeyReusedError ||
      exception instanceof PlanLimitExceededError
    );
  }
}
