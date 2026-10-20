import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { runWithRequestId } from '../../observability/request-context';

export type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, _response: Response, next: NextFunction): void {
    request.requestId = request.get('x-request-id') || randomUUID();
    runWithRequestId(request.requestId, next);
  }
}
