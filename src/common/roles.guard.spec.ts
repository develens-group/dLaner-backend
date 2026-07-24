import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('allows configured roles and rejects ordinary users', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = (role: UserRole) =>
      ({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'id',
              sessionId: 'sid',
              email: 'a@b.test',
              role,
              status: UserStatus.ACTIVE,
            },
          }),
        }),
      }) as unknown as ExecutionContext;
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(context(UserRole.USER))).toBe(false);
  });
});
