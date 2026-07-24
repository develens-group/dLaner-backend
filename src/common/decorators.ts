import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AccessPrincipal } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AccessPrincipal =>
    (
      context.switchToHttp().getRequest<Request>() as Request & {
        user: AccessPrincipal;
      }
    ).user,
);
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext): string =>
    (
      context.switchToHttp().getRequest<Request>() as Request & {
        user: AccessPrincipal;
      }
    ).user.sessionId,
);
export const CurrentRequestId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string | undefined =>
    (
      context.switchToHttp().getRequest<Request>() as Request & {
        requestId?: string;
      }
    ).requestId,
);
