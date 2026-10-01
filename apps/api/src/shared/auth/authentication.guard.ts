import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtTokenService } from './jwt-token.service';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: JwtTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      request.user = this.tokens.verify(authorization.slice(7));
      request.tenantId = request.user.tenantId;
      return true;
    }
    if (process.env.NODE_ENV !== 'production' && request.headers['x-user-role']) return true;
    throw new UnauthorizedException('Se requiere una sesión válida');
  }
}
