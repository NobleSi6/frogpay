import { UnauthorizedException } from '@nestjs/common';
import { resolveApiKeyTenantId } from './api-keys.controller';

describe('resolveApiKeyTenantId', () => {
  const routeTenantId = 'tenant-from-url';
  const currentTenantId = 'tenant-from-session';

  it('uses the session tenant for an OWNER even if the URL names another tenant', () => {
    expect(resolveApiKeyTenantId('OWNER', routeTenantId, currentTenantId)).toBe(currentTenantId);
  });

  it('uses the session tenant for an ADMIN even if the URL names another tenant', () => {
    expect(resolveApiKeyTenantId('ADMIN', routeTenantId, currentTenantId)).toBe(currentTenantId);
  });

  it('allows PLATFORM_ADMIN to target the tenant in the route', () => {
    expect(resolveApiKeyTenantId('PLATFORM_ADMIN', routeTenantId)).toBe(routeTenantId);
  });

  it('rejects tenant-scoped roles without an authenticated tenant context', () => {
    expect(() => resolveApiKeyTenantId('OWNER', routeTenantId)).toThrow(UnauthorizedException);
  });
});