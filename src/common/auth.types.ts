import { UserRole, UserStatus } from '@prisma/client';

export interface AccessPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface JwtClaims {
  sub: string;
  sid: string;
  type: 'access' | 'refresh';
  role?: UserRole;
  email?: string;
  iat?: number;
  exp?: number;
}
