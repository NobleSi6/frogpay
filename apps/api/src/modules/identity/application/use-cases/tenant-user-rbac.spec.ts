import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { Tenant } from '../../domain/entities/tenant.entity';
import { User } from '../../domain/entities/user.entity';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository';
import { TenantUsersController } from '../../presentation/http/tenant-users.controller';
import { DashboardPaymentsController } from '../../../payments/presentation/http/dashboard-payments.controller';
import { InviteTenantUserUseCase } from './invite-tenant-user.use-case';
import { ListTenantUsersUseCase } from './list-tenant-users.use-case';

describe('TSK-DEV3-405 tenant user RBAC', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  it.each(['OWNER', 'OPERATOR', 'VIEWER'] as const)(
    'invita y asigna correctamente el rol %s sin devolver el token',
    async (role) => {
      const users = {
        findByTenantEmail: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const tenants = {
        findById: jest.fn().mockResolvedValue(
          Tenant.create(
            {
              name: 'Tenant A',
              taxId: 'RBAC-TEST-1',
              contactEmail: 'owner@tenant.test',
            },
            tenantId,
          ),
        ),
      };
      const emailSender = {
        sendInvitation: jest.fn().mockResolvedValue(undefined),
      };
      const service = new InviteTenantUserUseCase(users as never, tenants as never, emailSender, {
        get: jest.fn().mockReturnValue('http://localhost:3001'),
      } as unknown as ConfigService);

      const result = await service.execute(tenantId, {
        email: `${role.toLowerCase()}@tenant.test`,
        role,
      });

      expect(result).toEqual(expect.objectContaining({ role, status: 'invited' }));
      expect(result).not.toHaveProperty('invitationToken');
      expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId, role }));
      expect(emailSender.sendInvitation).toHaveBeenCalledTimes(1);
    },
  );

  it('lista exclusivamente los usuarios solicitados con el tenant autenticado', async () => {
    const users = new InMemoryUserRepository();
    await users.save(User.createInvitedTenantUser(tenantId, 'viewer@tenant.test', 'VIEWER'));
    await users.save(
      User.createInvitedTenantUser(
        '22222222-2222-4222-8222-222222222222',
        'other@tenant.test',
        'VIEWER',
      ),
    );
    const service = new ListTenantUsersUseCase(users);

    await expect(service.execute(tenantId)).resolves.toEqual([
      expect.objectContaining({ email: 'viewer@tenant.test', role: 'VIEWER' }),
    ]);
    expect((await service.execute(tenantId)).map((user) => user.email)).not.toContain(
      'other@tenant.test',
    );
  });

  it('mantiene operaciones administrativas solo para Owner', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantUsersController.prototype.invite)).toEqual([
      'OWNER',
    ]);
  });

  it('permite operación normal a Operator y lectura a Viewer', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, DashboardPaymentsController.prototype.createTestPayment),
    ).toContain('OPERATOR');
    expect(
      Reflect.getMetadata(ROLES_KEY, DashboardPaymentsController.prototype.getDetails),
    ).toContain('VIEWER');
    expect(
      Reflect.getMetadata(ROLES_KEY, DashboardPaymentsController.prototype.createTestPayment),
    ).not.toContain('VIEWER');
  });

  it('responde 403 cuando falta el rol necesario', () => {
    const reflector = new Reflector();
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, ['OWNER'], handler);
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          user: { role: 'VIEWER', tenantId },
        }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
