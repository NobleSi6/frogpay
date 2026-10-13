import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
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
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status >= 500) {
        payload = {
          code: 'internal_error',
          message: 'Error interno del servidor',
          details: null,
          requestId,
        };
        this.logger.error(
          `HTTP ${status} exception (requestId=${requestId})`,
          exception.stack,
        );
      } else {
        const exceptionResponse = exception.getResponse();
        const responseBody =
          this.isRecord(exceptionResponse)
            ? exceptionResponse
            : {};
        const responseCode =
          'code' in responseBody && typeof responseBody.code === 'string'
            ? responseBody.code
            : undefined;
        const responseMessage =
          'message' in responseBody && typeof responseBody.message === 'string'
            ? responseBody.message
            : undefined;
        const responseDetails = 'details' in responseBody ? responseBody.details : null;

        payload = {
          code:
            responseCode ??
            (status === 401
              ? 'unauthorized'
              : status === 403
                ? 'forbidden'
                : status === 404
                  ? 'not_found'
                  : `http_${status}`),
          message:
            responseMessage ??
            (Array.isArray(responseBody.message)
              ? 'La solicitud contiene datos inválidos.'
              : 'La solicitud no pudo ser procesada.'),
          details:
            responseDetails ??
            (Array.isArray(responseBody.message) ? responseBody.message : null),
          requestId,
        };
      }
      // 401, 403, 404, 409, etc.: se respeta el código HTTP en lugar de convertirlo en 500.
      status = exception.getStatus();
      const body = exception.getResponse();
      const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      payload = {
        code: typeof fields.code === 'string' ? fields.code : defaultCodeForStatus(status),
        message:
          typeof fields.message === 'string' ? fields.message : typeof body === 'string' ? body : exception.message,
        details: fields.details ?? null,
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

function defaultCodeForStatus(status: number): string {
  const codes: Record<number, string> = {
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    409: 'conflict',
    429: 'too_many_requests',
  };
  return codes[status] ?? (status >= 500 ? 'internal_error' : 'http_error');
}
