import { UserPlan, UserRole, UserStatus } from '@prisma/client';

export interface AccessPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  role: UserRole;
  plan: UserPlan;
  status: UserStatus;
  client: 'web' | 'wordpress';
  wordpressSiteId?: string;
}

export interface JwtClaims {
  sub: string;
  sid: string;
  type: 'access' | 'refresh';
  role?: UserRole;
  plan?: UserPlan;
  email?: string;
  client?: 'web' | 'wordpress';
  iat?: number;
  exp?: number;
}
