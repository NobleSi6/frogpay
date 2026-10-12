import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ERROR_CATALOG } from './errors/error-catalog';
import { IdempotencyInProgressError } from './errors/idempotency-in-progress-error';
import { IdempotencyKeyReusedError } from './errors/idempotency-key-reused-error';
import { PlanLimitExceededError } from './errors/plan-limit-exceeded-error';
import { ValidationError } from './errors/validation-error';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost(requestId = 'req_test_123') {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const request = { requestId };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, json }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it.each([
    [
      new ValidationError({ field: 'amount' }),
      ERROR_CATALOG.validation_error,
    ],
    [
      new IdempotencyInProgressError({ key: 'idem-123' }),
      ERROR_CATALOG.idempotency_in_progress,
    ],
    [
      new IdempotencyKeyReusedError({ key: 'idem-123' }),
      ERROR_CATALOG.idempotency_key_reused,
    ],
    [
      new PlanLimitExceededError({ limit: '5000.00', used: '5120.00' }),
      ERROR_CATALOG.plan_limit_exceeded,
    ],
  ])('returns the catalog response for %s', (exception, catalogEntry) => {
    const details = (exception as ValidationError).details;
    const { host, json, status } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(catalogEntry.httpStatus);
    expect(json).toHaveBeenCalledWith({
      code: catalogEntry.code,
      message: catalogEntry.message,
      details,
      requestId: 'req_test_123',
    });
  });

  it('maps a standard ValidationPipe BadRequestException to validation_error', () => {
    const validationMessages = ['amount must be a positive number'];
    const { host, json, status } = createHost();

    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: validationMessages,
        error: 'Bad Request',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      code: ERROR_CATALOG.validation_error.code,
      message: ERROR_CATALOG.validation_error.message,
      details: validationMessages,
      requestId: 'req_test_123',
    });
  });

  it.each([
    [new UnauthorizedException('Se requiere una sesión válida'), 401, 'unauthorized'],
    [new ForbiddenException('Acceso denegado'), 403, 'forbidden'],
    [new NotFoundException('Pago no encontrado'), 404, 'not_found'],
  ])('preserves standard HTTP status and maps %s', (exception, expectedStatus, code) => {
    const { host, json, status } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({
      code,
      message: exception.message,
      details: null,
      requestId: 'req_test_123',
    });
  });

  it.each([
    [
      new ConflictException({
        code: 'idempotency_in_progress',
        message: 'Ya existe una solicitud en proceso.',
      }),
      409,
      'idempotency_in_progress',
    ],
    [
      new UnprocessableEntityException({
        code: 'idempotency_key_reused',
        message: 'La clave ya se usó con otra solicitud.',
        details: { key: 'idem-123' },
      }),
      422,
      'idempotency_key_reused',
    ],
  ])('preserves structured HTTP error codes for %s', (exception, expectedStatus, code) => {
    const exceptionResponse = exception.getResponse() as {
      message: string;
      details?: unknown;
    };
    const { host, json, status } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({
      code,
      message: exceptionResponse.message,
      details: exceptionResponse.details ?? null,
      requestId: 'req_test_123',
    });
  });

  it('hides details from standard HTTP server exceptions while retaining their status', () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, json, status } = createHost();

    filter.catch(new InternalServerErrorException('database details'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'internal_error',
      message: 'Error interno del servidor',
      details: null,
      requestId: 'req_test_123',
    });
    expect(loggerError).toHaveBeenCalled();
    loggerError.mockRestore();
  });

  it('hides unrecognized errors from the response and logs the real error', () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, json, status } = createHost();
    const error = new Error('database connection string leaked internally');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'internal_error',
      message: 'Error interno del servidor',
      details: null,
      requestId: 'req_test_123',
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('database connection string leaked internally'),
      error.stack,
    );
    loggerError.mockRestore();
  });
});
