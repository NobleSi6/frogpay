import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';

export interface ApiKeyContext {
  tenantId: string;
  environment: 'sandbox' | 'production';
  apiKeyId: string;
  keyPrefix: string;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly tenantContext: PrismaTenantContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];

    if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
      throw new UnauthorizedException({
        code: 'missing_api_key',
        message: 'El encabezado X-Api-Key es obligatorio.',
      });
    }

    const rawKey = apiKeyHeader.trim();
    let keyPrefix: string;
    let secretPart: string;

    if (rawKey.includes('.')) {
      const dotIndex = rawKey.indexOf('.');
      keyPrefix = rawKey.slice(0, dotIndex);
      secretPart = rawKey.slice(dotIndex + 1);
    } else {
      keyPrefix = rawKey.slice(0, 12);
      secretPart = rawKey.slice(12);
    }

    if (!keyPrefix || !secretPart) {
      throw new UnauthorizedException({
        code: 'invalid_api_key',
        message: 'Formato de X-Api-Key inválido.',
      });
    }

    const apiKey = await this.tenantContext.withGlobalAccess(async (tx) => {
      return tx.api_key.findUnique({
        where: { key_prefix: keyPrefix },
      });
    });

    if (!apiKey) {
      throw new UnauthorizedException({
        code: 'invalid_api_key',
        message: 'La API key no existe o es inválida.',
      });
    }

    if (apiKey.status === 'revoked') {
      throw new UnauthorizedException({
        code: 'revoked_api_key',
        message: 'La API key ha sido revocada.',
      });
    }

    if (apiKey.status !== 'active') {
      throw new UnauthorizedException({
        code: 'invalid_api_key',
        message: 'La API key no está activa.',
      });
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      throw new UnauthorizedException({
        code: 'invalid_api_key',
        message: 'La API key ha expirado.',
      });
    }

    // Comparación segura en tiempo constante contra el hash del secret o de la key completa
    const hashSecret = CryptoUtil.hashString(secretPart);
    const hashFull = CryptoUtil.hashString(rawKey);

    const matchesSecret = CryptoUtil.constantTimeCompare(apiKey.secret_hash, hashSecret);
    const matchesFull = CryptoUtil.constantTimeCompare(apiKey.secret_hash, hashFull);

    if (!matchesSecret && !matchesFull) {
      throw new UnauthorizedException({
        code: 'invalid_api_key',
        message: 'La API key no es válida.',
      });
    }

    // Actualizar last_used_at de forma asíncrona sin bloquear el request
    this.tenantContext.withGlobalAccess(async (tx) => {
      await tx.api_key.update({
        where: { id: apiKey.id },
        data: { last_used_at: new Date() },
      });
    }).catch(() => {
      // No fallar la petición si falla la actualización de métrica de último uso
    });

    const apiKeyContext: ApiKeyContext = {
      tenantId: apiKey.tenant_id,
      environment: apiKey.environment === 'production' ? 'production' : 'sandbox',
      apiKeyId: apiKey.id,
      keyPrefix: apiKey.key_prefix,
    };

    request.apiKeyContext = apiKeyContext;
    request.tenantId = apiKey.tenant_id;

    return true;
  }
}
