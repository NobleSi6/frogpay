import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiKeyContext } from '../guards/api-key-auth.guard';

export const CurrentApiKeyContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyContext => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.apiKeyContext) {
      throw new UnauthorizedException('No se encontró el contexto de API Key autenticado.');
    }
    return request.apiKeyContext;
  },
);
