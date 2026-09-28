import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId || request.user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('No se encontró el contexto del tenant en la solicitud');
    }
    return tenantId;
  },
);
