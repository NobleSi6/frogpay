import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request as ExpressRequest } from 'express';

export interface AuthenticatedTenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

interface RequestWithTenantContext extends ExpressRequest {
  tenantId?: string;
  user?: { id?: string; tenantId?: string; role?: string };
  tenantContext?: AuthenticatedTenantContext;
}

interface CurrentTenantOptions {
  optional?: boolean;
}

export const CurrentTenant = createParamDecorator(
  (data: CurrentTenantOptions | undefined, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();
    const tenantId = request.tenantId || request.user?.tenantId;
    if (!tenantId) {
      if (data?.optional) return undefined;
      throw new UnauthorizedException('No se encontró el contexto del tenant en la solicitud');
    }
    return tenantId;
  },
);

export function requireTenantContext(
  request: RequestWithTenantContext,
): AuthenticatedTenantContext {
  if (!request.tenantContext) {
    throw new UnauthorizedException('No se encontró el contexto del tenant.');
  }

  return request.tenantContext;
}

export function requireAuthenticatedTenantContext(
  request: RequestWithTenantContext,
): AuthenticatedTenantContext {
  if (request.tenantContext) return request.tenantContext;

  const tenantId = request.tenantId ?? request.user?.tenantId;
  const userId = request.user?.id;
  const role = request.user?.role;
  if (!tenantId || !userId || !role) {
    throw new UnauthorizedException('No se encontró el contexto del tenant en la solicitud');
  }

  return { tenantId, userId, role };
}

export const CurrentTenantContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedTenantContext => {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithTenantContext>();
    return requireAuthenticatedTenantContext(request);
  },
);

/**
 * SOLO PARA DESARROLLO LOCAL: este guard confía en headers controlados por
 * quien realiza la petición y permite suplantar tenant, usuario y rol. Nunca
 * habilitarlo en producción ni usarlo como sustituto de autenticación real.
 * Reemplazarlo por el guard JWT de Jean cuando esté disponible.
 */
@Injectable()
export class ForceHeaderTenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithTenantContext>();
    const tenantId = this.getHeader(request, 'x-debug-tenant-id');
    const userId = this.getHeader(request, 'x-debug-user-id');
    const role = this.getHeader(request, 'x-debug-role');

    if (!tenantId || !isUUID(tenantId) || !userId || !role) {
      throw new UnauthorizedException(
        'Los headers x-debug-tenant-id, x-debug-user-id y x-debug-role son obligatorios; tenant-id debe ser UUID.',
      );
    }

    request.tenantContext = { tenantId, userId, role };
    return true;
  }

  private getHeader(
    request: RequestWithTenantContext,
    name: string,
  ): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
