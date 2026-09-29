import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimingInterceptor.name);
  private readonly SLA_THRESHOLD_MS = 300; // RNF-01: < 300ms

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now();
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest();

    return next.handle().pipe(
      tap(() => {
        const duration = Math.round(performance.now() - start);
        if (response && response.setHeader) {
          response.setHeader('X-Response-Time', `${duration}ms`);
        }

        if (duration > this.SLA_THRESHOLD_MS) {
          this.logger.warn(
            `[SLA Alert] [${request.method}] ${request.url} tomó ${duration}ms (Excede el SLA de ${this.SLA_THRESHOLD_MS}ms - RNF-01)`,
          );
        }
      }),
    );
  }
}
