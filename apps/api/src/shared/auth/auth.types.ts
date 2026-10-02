import type { UserRole } from '../../modules/identity/domain/entities/user.entity';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}

export interface AccessTokenClaims extends AuthenticatedUser {
  iat: number;
  exp: number;
  iss: 'frogpay-api';
  aud: 'frogpay-dashboard';
}
