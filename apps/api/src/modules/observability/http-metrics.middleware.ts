import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import {
  Request,
  Response,
  NextFunction,
} from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware
  implements NestMiddleware
{
  constructor(
    private readonly metrics: MetricsService,
  ) {}

  use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const start = process.hrtime.bigint();

    response.once('finish', () => {
      const elapsed =
        Number(process.hrtime.bigint() - start) /
        1_000_000_000;

      const route = request.route?.path
        ? `${request.baseUrl}${request.route.path}`
        : 'unmatched';

      this.metrics.recordHttp(
        request.method,
        route,
        response.statusCode,
        elapsed,
      );
    });

    next();
  }
}
