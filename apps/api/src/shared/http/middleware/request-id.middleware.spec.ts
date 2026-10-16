import { NextFunction, Response } from 'express';
import { RequestIdMiddleware, RequestWithId } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('preserves an existing x-request-id header', () => {
    const request = { get: jest.fn().mockReturnValue('req_client_123') } as unknown as RequestWithId;
    const response = {} as Response;
    const next = jest.fn() as NextFunction;

    middleware.use(request, response, next);

    expect(request.requestId).toBe('req_client_123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when x-request-id is missing', () => {
    const request = { get: jest.fn().mockReturnValue(undefined) } as unknown as RequestWithId;
    const response = {} as Response;
    const next = jest.fn() as NextFunction;

    middleware.use(request, response, next);

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
