import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import { CredentialsEncryptionService } from '../infrastructure/credentials/credentials-encryption.service';

export type StripeEnvironment = 'sandbox' | 'production';

export interface StripeCredentialsInput {
  publishableKey: string;
  secretKey: string;
}

export interface StripeCredentialsResponse {
  environment: StripeEnvironment;
  configured: boolean;
  publishableKey: string | null;
  secretKeyMasked: string | null;
}

@Injectable()
export class StripeCredentialsService {
  constructor(
    private readonly tenantContext: PrismaTenantContextService,
    private readonly encryption: CredentialsEncryptionService,
  ) {}

  async get(
    tenantId: string,
    role: string,
    environment: string,
  ): Promise<StripeCredentialsResponse> {
    this.assertOwner(role);
    const validEnvironment = this.parseEnvironment(environment);

    return this.tenantContext.withTenant(tenantId, async (tx) => {
      const provider = await tx.provider.findUnique({
        where: { code: 'stripe' },
        select: { id: true },
      });
      if (!provider) throw new NotFoundException('El proveedor Stripe no está configurado.');

      const credential = await tx.tenant_provider_credential.findUnique({
        where: {
          tenant_id_provider_id_environment: {
            tenant_id: tenantId,
            provider_id: provider.id,
            environment: validEnvironment,
          },
        },
        select: { credentials_encrypted: true, is_active: true },
      });

      if (!credential || !credential.is_active) {
        return this.emptyResponse(validEnvironment);
      }

      const credentials = this.decryptCredentials(credential.credentials_encrypted);
      return {
        environment: validEnvironment,
        configured: true,
        publishableKey: credentials.publishableKey,
        secretKeyMasked: maskSecret(credentials.secretKey),
      };
    });
  }

  async save(
    tenantId: string,
    role: string,
    environment: string,
    input: StripeCredentialsInput,
  ): Promise<StripeCredentialsResponse> {
    this.assertOwner(role);
    const validEnvironment = this.parseEnvironment(environment);
    this.validateKeyPrefixes(validEnvironment, input);
    const encrypted = this.encryption.encrypt(JSON.stringify(input));

    return this.tenantContext.withTenant(tenantId, async (tx) => {
      const provider = await tx.provider.findUnique({
        where: { code: 'stripe' },
        select: { id: true },
      });
      if (!provider) throw new NotFoundException('El proveedor Stripe no está configurado.');

      await tx.tenant_provider_credential.upsert({
        where: {
          tenant_id_provider_id_environment: {
            tenant_id: tenantId,
            provider_id: provider.id,
            environment: validEnvironment,
          },
        },
        create: {
          tenant_id: tenantId,
          provider_id: provider.id,
          environment: validEnvironment,
          credentials_encrypted: encrypted,
        },
        update: { credentials_encrypted: encrypted, is_active: true },
      });

      return {
        environment: validEnvironment,
        configured: true,
        publishableKey: input.publishableKey,
        secretKeyMasked: maskSecret(input.secretKey),
      };
    });
  }

  private assertOwner(role: string): void {
    if (role !== 'OWNER') {
      throw new ForbiddenException('Solo el propietario del tenant puede administrar credenciales.');
    }
  }

  private parseEnvironment(environment: string): StripeEnvironment {
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new BadRequestException('El ambiente debe ser sandbox o production.');
    }
    return environment;
  }

  private validateKeyPrefixes(
    environment: StripeEnvironment,
    input: StripeCredentialsInput,
  ): void {
    const prefix = environment === 'sandbox' ? 'test' : 'live';
    if (
      !input.publishableKey.startsWith(`pk_${prefix}_`) ||
      !input.secretKey.startsWith(`sk_${prefix}_`)
    ) {
      throw new BadRequestException(
        `Las claves de Stripe deben usar los prefijos pk_${prefix}_ y sk_${prefix}_ para ${environment}.`,
      );
    }
  }

  private decryptCredentials(encrypted: string): StripeCredentialsInput {
    try {
      const value: unknown = JSON.parse(this.encryption.decrypt(encrypted));
      if (
        typeof value === 'object' && value !== null &&
        'publishableKey' in value && typeof value.publishableKey === 'string' &&
        'secretKey' in value && typeof value.secretKey === 'string'
      ) {
        return { publishableKey: value.publishableKey, secretKey: value.secretKey };
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new NotFoundException('Las credenciales de Stripe almacenadas no son válidas.');
    }
    throw new NotFoundException('Las credenciales de Stripe almacenadas no son válidas.');
  }

  private emptyResponse(environment: StripeEnvironment): StripeCredentialsResponse {
    return {
      environment,
      configured: false,
      publishableKey: null,
      secretKeyMasked: null,
    };
  }
}

function maskSecret(secret: string): string {
  const prefixEnd = secret.indexOf('_', secret.indexOf('_') + 1);
  return `${secret.slice(0, prefixEnd + 1)}...${secret.slice(-4)}`;
}