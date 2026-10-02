import { ConfigService } from '@nestjs/config';
import { JwtTokenService } from './jwt-token.service';

describe('JwtTokenService', () => {
  const config = new ConfigService({ JWT_SECRET: 'unit-test-secret-with-more-than-32-characters', JWT_EXPIRES_IN_SECONDS: 3600 });
  const service = new JwtTokenService(config);

  it('signs and verifies the minimum authenticated identity', () => {
    const identity = { id: 'user-id', email: 'owner@example.test', role: 'OWNER' as const, tenantId: 'tenant-id' };
    const signed = service.sign(identity);
    expect(service.verify(signed.accessToken)).toEqual(identity);
    expect(signed.expiresIn).toBe(3600);
  });

  it('rejects a tampered token', () => {
    const token = service.sign({ id: 'user-id', email: 'owner@example.test', role: 'OWNER' }).accessToken;
    expect(() => service.verify(`${token.slice(0, -1)}x`)).toThrow('Token de acceso inválido');
  });
});
