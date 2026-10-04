import { ConfigService } from '@nestjs/config';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import { CredentialsEncryptionService } from '../infrastructure/credentials/credentials-encryption.service';
import { StripeCredentialsService } from './stripe-credentials.service';

describe('StripeCredentialsService', () => {
  const tenantId = '0e21495a-7a01-4dd7-8393-6c9cd724d752';
  const input = {
    publishableKey: 'pk_test_example1234',
    secretKey: 'sk_test_secret1234',
  };
  let stored: { credentials_encrypted: string; is_active: boolean } | null;
  let service: StripeCredentialsService;
  let upsert: jest.Mock;
  let withTenant: jest.Mock;

  beforeEach(() => {
    stored = null;
    const transaction = {
      provider: { findUnique: jest.fn().mockResolvedValue({ id: 'stripe-provider-id' }) },
      tenant_provider_credential: {
        findUnique: jest.fn().mockImplementation(async () => stored),
        upsert: jest.fn().mockImplementation(async (args: {
          create: { credentials_encrypted: string };
        }) => {
          stored = { credentials_encrypted: args.create.credentials_encrypted, is_active: true };
          return stored;
        }),
      },
    };
    withTenant = jest.fn(async (_tenantId: string, callback: (tx: never) => Promise<unknown>) =>
      callback(transaction as never),
    );
    upsert = transaction.tenant_provider_credential.upsert;

    const encryption = new CredentialsEncryptionService({
      get: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as ConfigService);
    service = new StripeCredentialsService(
      { withTenant } as unknown as PrismaTenantContextService,
      encryption,
    );
  });

  it('stores encrypted credentials and only returns a masked secret key', async () => {
    const saved = await service.save(tenantId, 'OWNER', 'sandbox', input);
    const storedValue = upsert.mock.calls[0][0].create.credentials_encrypted as string;

    expect(withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
    expect(storedValue).not.toContain(input.secretKey);
    expect(saved).toEqual({
      environment: 'sandbox',
      configured: true,
      publishableKey: input.publishableKey,
      secretKeyMasked: 'sk_test_...1234',
    });
    expect(JSON.stringify(saved)).not.toContain(input.secretKey);
  });

  it('returns decrypted public key and masked secret when credentials are queried', async () => {
    await service.save(tenantId, 'OWNER', 'sandbox', input);

    const result = await service.get(tenantId, 'OWNER', 'sandbox');

    expect(result.publishableKey).toBe(input.publishableKey);
    expect(result.secretKeyMasked).toBe('sk_test_...1234');
    expect(JSON.stringify(result)).not.toContain(input.secretKey);
  });

  it('rejects non-owners and keys from the wrong environment', async () => {
    await expect(service.save(tenantId, 'ADMIN', 'sandbox', input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.save(tenantId, 'OWNER', 'sandbox', {
      ...input,
      secretKey: 'sk_live_wrong_environment',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenant).not.toHaveBeenCalled();
  });
});