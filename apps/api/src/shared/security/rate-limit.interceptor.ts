import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, switchMap } from 'rxjs';
import { ERROR_CATALOG } from '../http/errors/error-catalog';
import { RateLimitService } from './rate-limit.service';

type AuthenticatedRequest = Request & {
  tenantId?: string;
  user?: { tenantId?: string | null };
  apiKeyContext?: { tenantId: string; apiKeyId: string };
};

/**
 * Aplica el rate limiting después de los guards (ya se conoce el tenant y la
 * API Key). Responde 429 rate_limit_exceeded con Retry-After y añade las
 * cabeceras X-RateLimit-* a cada respuesta. Las rutas públicas sin tenant y el
 * Platform Admin no se limitan aquí (los protege NGINX).
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(private readonly rateLimit: RateLimitService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const tenantId = request.apiKeyContext?.tenantId ?? request.tenantId ?? request.user?.tenantId ?? undefined;
    if (!tenantId) return next.handle();

    return from(this.rateLimit.hit(tenantId, request.apiKeyContext?.apiKeyId)).pipe(
      switchMap((decision) => {
        response.setHeader('X-RateLimit-Limit', String(decision.limit));
        response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
        if (!decision.allowed) {
          response.setHeader('Retry-After', String(decision.retryAfterSeconds));
          throw new HttpException(
            {
              code: ERROR_CATALOG.rate_limit_exceeded.code,
              message: ERROR_CATALOG.rate_limit_exceeded.message,
              details: { limit: decision.limit, windowSeconds: 60, retryAfterSeconds: decision.retryAfterSeconds },
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return next.handle();
      }),
    );
  }
}
