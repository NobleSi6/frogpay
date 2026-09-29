import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    // El header solo sirve para pruebas locales; en producciÃ³n se acepta un usuario autenticado.
    const developmentRole = process.env.NODE_ENV === 'production'
      ? undefined
      : request.headers['x-user-role'];
    const userRole = request.user?.role || developmentRole;

    if (!userRole) {
      throw new ForbiddenException('Acceso denegado: se requiere autenticación con rol autorizado');
    }

    const hasRole = requiredRoles.includes(userRole);
    if (!hasRole) {
      throw new ForbiddenException(`Acceso denegado: se requiere uno de los siguientes roles [${requiredRoles.join(', ')}]`);
    }

    return true;
  }
}
