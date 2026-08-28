import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserPlan, UserRole, UserStatus } from '@prisma/client';
import { AdminService } from './admin.service';

describe('AdminService list/get', () => {
  const userRow = {
    id: 'u1',
    email: 'a@b.com',
    displayName: 'A',
    role: UserRole.USER,
    plan: UserPlan.FREE,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  it('passes role/status/plan into list where', async () => {
    const findMany = jest.fn().mockResolvedValue([userRow]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      $transaction: jest.fn((ops: unknown[]) =>
        Promise.all(ops as Promise<unknown>[]),
      ),
      user: { findMany, count },
    };
    const credits = { getOrCreateAccount: jest.fn() };
    const service = new AdminService(
      prisma as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      credits as never,
    );
    await service.list({
      page: 1,
      limit: 20,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      plan: UserPlan.PRO,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          plan: UserPlan.PRO,
        }),
      }),
    );
  });

  it('get returns creditAccount summary', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(userRow) },
    };
    const credits = {
      getOrCreateAccount: jest.fn().mockResolvedValue({
        availableBalance: 10,
        reservedBalance: 2,
        lifetimePurchased: 100,
        lifetimeConsumed: 88,
      }),
    };
    const service = new AdminService(
      prisma as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      credits as never,
    );
    const result = await service.get('u1');
    expect(result.creditAccount).toEqual({
      availableBalance: 10,
      reservedBalance: 2,
      lifetimePurchased: 100,
      lifetimeConsumed: 88,
    });
  });

  it('get throws when user missing', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AdminService(
      prisma as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      { getOrCreateAccount: jest.fn() } as never,
    );
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService create', () => {
  const actorAdmin = { userId: 'admin1', role: UserRole.ADMIN } as const;
  const actorSuper = { userId: 'super1', role: UserRole.SUPER_ADMIN } as const;

  function build(
    prisma: object,
    credits = {
      getOrCreateAccount: jest.fn().mockResolvedValue({
        availableBalance: 0,
        reservedBalance: 0,
        lifetimePurchased: 0,
        lifetimeConsumed: 0,
      }),
    },
  ) {
    return new AdminService(
      prisma as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      credits as never,
    );
  }

  it('forbids ADMIN creating ADMIN', async () => {
    const service = build({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.create(actorAdmin as never, {
        email: 'x@y.com',
        password: 'StrongPass123',
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(/Forbidden|role/i);
  });

  it('creates USER as ACTIVE with verified email and credit account', async () => {
    const created = {
      id: 'new1',
      email: 'x@y.com',
      displayName: 'X',
      role: UserRole.USER,
      plan: UserPlan.FREE,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const create = jest.fn().mockResolvedValue(created);
    const service = build({
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    });
    const result = await service.create(actorAdmin as never, {
      email: 'X@Y.com',
      password: 'StrongPass123',
      role: UserRole.USER,
      displayName: 'X',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'x@y.com',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          plan: UserPlan.FREE,
        }),
      }),
    );
    expect(result.creditAccount.availableBalance).toBe(0);
  });

  it('conflicts on duplicate email', async () => {
    const service = build({
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'exists' }) },
    });
    await expect(
      service.create(actorSuper as never, {
        email: 'x@y.com',
        password: 'StrongPass123',
        role: UserRole.USER,
      }),
    ).rejects.toThrow(/Conflict|Unable|exists/i);
  });
});

describe('AdminService resetPassword/changeRole', () => {
  const selectUser = {
    id: 'u2',
    email: 't@t.com',
    displayName: null,
    role: UserRole.USER,
    plan: UserPlan.FREE,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  it('resetPassword updates hash and revokes sessions', async () => {
    const audit = { record: jest.fn() };
    const update = jest.fn().mockResolvedValue(selectUser);
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(selectUser),
        update,
      },
      session: { updateMany },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ user: { update }, session: { updateMany } }),
      ),
    };
    const service = new AdminService(
      prisma as never,
      audit as never,
      { get: jest.fn() } as never,
      { getOrCreateAccount: jest.fn() } as never,
    );
    await service.resetPassword(
      { userId: 'admin1', role: UserRole.ADMIN } as never,
      'u2',
      'NewStrongPass1',
    );
    expect(update).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u2', revokedAt: null },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'admin.user.reset_password',
      'admin1',
      'u2',
      'User',
    );
  });

  it('changeRole requires SUPER_ADMIN actor in service policy', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(selectUser),
        update: jest.fn(),
      },
    };
    const service = new AdminService(
      prisma as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      { getOrCreateAccount: jest.fn() } as never,
    );
    await expect(
      service.changeRole(
        { userId: 'admin1', role: UserRole.ADMIN } as never,
        'u2',
        UserRole.REVIEWER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('changeRole updates role for SUPER_ADMIN', async () => {
    const update = jest.fn().mockResolvedValue({
      ...selectUser,
      role: UserRole.REVIEWER,
    });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(selectUser),
        update,
      },
    };
    const audit = { record: jest.fn() };
    const service = new AdminService(
      prisma as never,
      audit as never,
      { get: jest.fn() } as never,
      { getOrCreateAccount: jest.fn() } as never,
    );
    await service.changeRole(
      { userId: 'super1', role: UserRole.SUPER_ADMIN } as never,
      'u2',
      UserRole.REVIEWER,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: UserRole.REVIEWER },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'admin.user.role_changed',
      'super1',
      'u2',
      'User',
      { role: UserRole.REVIEWER },
    );
  });
});
