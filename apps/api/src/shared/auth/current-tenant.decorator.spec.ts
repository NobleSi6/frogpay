import { UnauthorizedException } from '@nestjs/common';
import {
  ForceHeaderTenantContextGuard,
  requireTenantContext,
} from './current-tenant.decorator.js';

describe('CurrentTenant', () => {
  it('throws UnauthorizedException when request has no tenantContext', () => {
    expect(() => requireTenantContext({ headers: {} } as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('populates request context from valid development debug headers', () => {
    const request = {
      headers: {
        'x-debug-tenant-id': '2c1b4e4f-6d5a-4f84-9a88-8e4650b0a321',
        'x-debug-user-id': 'user-1',
        'x-debug-role': 'tenant_owner',
      },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };

    expect(new ForceHeaderTenantContextGuard().canActivate(context as never)).toBe(
      true,
    );
    expect(request).toHaveProperty('tenantContext', {
      tenantId: '2c1b4e4f-6d5a-4f84-9a88-8e4650b0a321',
      userId: 'user-1',
      role: 'tenant_owner',
    });
  });

  it('rejects an invalid debug tenant UUID', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-debug-tenant-id': 'not-a-uuid',
            'x-debug-user-id': 'user-1',
            'x-debug-role': 'tenant_owner',
          },
        }),
      }),
    };

    expect(() =>
      new ForceHeaderTenantContextGuard().canActivate(context as never),
    ).toThrow(UnauthorizedException);
  });
});