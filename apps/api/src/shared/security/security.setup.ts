import { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Hardening HTTP de la API:
 * - helmet: cabeceras de seguridad (HSTS, nosniff, frame-ancestors, sin X-Powered-By).
 * - CORS restringido a los orígenes del dashboard (CORS_ORIGIN, separados por coma).
 * - Simuladores /api/v1/test/* bloqueados con 403 en producción.
 */
export function applySecurity(app: INestApplication, corsOrigins: string): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI necesita scripts y estilos en línea.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  const allowed = parseOrigins(corsOrigins);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      // Sin cabecera Origin = no es un navegador (servidor a servidor, curl): CORS no aplica.
      callback(null, !origin || allowed.includes(origin));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    credentials: true,
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    const path = request.path || request.originalUrl || request.url || '';
    if (process.env.NODE_ENV === 'production' && /^\/api\/v1\/test\//.test(path)) {
      response.status(403).json({
        code: 'simulation_not_allowed',
        message: 'Los simuladores están deshabilitados en producción.',
        details: null,
      });
      return;
    }
    next();
  });
}

export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
