import { scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { UnauthorizedException } from '@nestjs/common';
import { LoginUseCase } from './login.use-case';
import { User } from '../../domain/entities/user.entity';

const scrypt = promisify(scryptCallback);

describe('LoginUseCase', () => {
  it('verifies scrypt and returns only safe identity data with a token', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const password = 'OwnerPassword123!';
    const hash = `scrypt$${salt}$${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`;
    const user = User.reconstitute({ tenantId: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test', role: 'OWNER', status: 'active', passwordHash: hash }, '00000000-0000-4000-8000-000000000002', new Date(), new Date());
    const users = { findByEmail: jest.fn().mockResolvedValue(user) };
    const tenants = { findById: jest.fn().mockResolvedValue({ id: user.tenantId, name: 'Acme' }) };
    const tokens = { sign: jest.fn().mockReturnValue({ accessToken: 'signed', expiresIn: 3600 }) };
    const result = await new LoginUseCase(users as never, tenants as never, tokens as never).execute({ email: user.email.value, password });
    expect(result.user).toEqual({ id: user.id, email: user.email.value, role: 'OWNER', tenant: { id: user.tenantId, name: 'Acme' } });
    expect(result).not.toHaveProperty('passwordHash');
    expect(tokens.sign).toHaveBeenCalledWith(expect.objectContaining({ role: 'OWNER', tenantId: user.tenantId }));
  });

  it('uses the same generic error for invalid credentials', async () => {
    const useCase = new LoginUseCase({ findByEmail: jest.fn().mockResolvedValue(null) } as never, {} as never, {} as never);
    await expect(useCase.execute({ email: 'missing@example.test', password: 'WrongPassword123!' })).rejects.toThrow(UnauthorizedException);
  });

  it('supports a platform admin without tenant context', async () => {
    const salt = 'ffeeddccbbaa99887766554433221100';
    const password = 'PlatformPassword123!';
    const hash = `scrypt$${salt}$${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`;
    const admin = User.reconstitute({ email: 'admin@example.test', role: 'PLATFORM_ADMIN', status: 'active', passwordHash: hash }, '00000000-0000-4000-8000-000000000003', new Date(), new Date());
    const tenants = { findById: jest.fn() };
    const tokens = { sign: jest.fn().mockReturnValue({ accessToken: 'signed', expiresIn: 3600 }) };
    const result = await new LoginUseCase({ findByEmail: jest.fn().mockResolvedValue(admin) } as never, tenants as never, tokens as never).execute({ email: admin.email.value, password });
    expect(result.user).toEqual({ id: admin.id, email: admin.email.value, role: 'PLATFORM_ADMIN' });
    expect(tenants.findById).not.toHaveBeenCalled();
  });
});
