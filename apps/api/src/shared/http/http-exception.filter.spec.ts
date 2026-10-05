import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
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
