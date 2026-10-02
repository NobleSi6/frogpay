import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AccessTokenClaims, AuthenticatedUser } from './auth.types';

@Injectable()
export class JwtTokenService {
  constructor(private readonly config: ConfigService) {}

  sign(user: AuthenticatedUser): { accessToken: string; expiresIn: number } {
    const expiresIn = this.config.get<number>('JWT_EXPIRES_IN_SECONDS', 3600);
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      ...user,
      iat: now,
      exp: now + expiresIn,
      iss: 'frogpay-api',
      aud: 'frogpay-dashboard',
    };
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode(claims);
    return { accessToken: `${header}.${payload}.${this.signature(`${header}.${payload}`)}`, expiresIn };
  }

  verify(token: string): AuthenticatedUser {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Token de acceso inválido');
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(this.signature(unsigned));
    const received = Buffer.from(parts[2]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Token de acceso inválido');
    }
    let claims: AccessTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as AccessTokenClaims;
    } catch {
      throw new UnauthorizedException('Token de acceso inválido');
    }
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp <= now || claims.iss !== 'frogpay-api' || claims.aud !== 'frogpay-dashboard') {
      throw new UnauthorizedException('La sesión expiró o no es válida');
    }
    if (!claims.id || !claims.email || !claims.role) throw new UnauthorizedException('Token de acceso inválido');
    return { id: claims.id, email: claims.email, role: claims.role, tenantId: claims.tenantId };
  }

  private signature(value: string): string {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return createHmac('sha256', secret).update(value).digest('base64url');
  }
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
