import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

interface CurrentTenantOptions {
  optional?: boolean;
}

export const CurrentTenant = createParamDecorator(
  (data: CurrentTenantOptions | undefined, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId || request.user?.tenantId;
    if (!tenantId) {
      if (data?.optional) return undefined;
      throw new UnauthorizedException('No se encontró el contexto del tenant en la solicitud');
    }
    return tenantId;
  },
);
