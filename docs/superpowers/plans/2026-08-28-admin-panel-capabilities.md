# Admin Panel Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill admin API gaps (richer user management, unified user activity timeline, audit log listing) and publish `docs/ADMIN_PANEL_API.md` plus `http/admin.http` samples for the external admin panel.

**Architecture:** Extend existing NestJS `admin` and `audit` modules; import `CreditsModule` into `admin` for `getOrCreateAccount`; merge activity from AuditLog, CreditLedgerEntry, ApiRequestRecord, AiRequest, and Session without a new activity table. Keep existing credit grant/deduct and request/AI admin routes unchanged.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, class-validator/Swagger DTOs, Jest unit tests, argon2id passwords.

**Spec:** `docs/superpowers/specs/2026-08-28-admin-panel-capabilities-design.md`

## Global Constraints

- Backend-only; no admin UI
- Roles only (`USER` | `REVIEWER` | `ADMIN` | `SUPER_ADMIN`); no CASL/ACL
- `ADMIN` may create/manage `USER`/`REVIEWER` only; only `SUPER_ADMIN` may change roles or create `ADMIN`/`SUPER_ADMIN`
- Administrators cannot alter themselves; `ADMIN` cannot alter `SUPER_ADMIN` (extend `assertCanAlter`)
- Admin-created users: `status=ACTIVE`, set `emailVerifiedAt` now
- Password policy: reuse `PASSWORD_PATTERN` + `Length(10, 128)` from `src/auth/auth.dto.ts`
- Envelope: existing `response(data, meta)`
- Do not break existing `/api/v1/admin/credit-accounts/...` contracts
- Audit actions: `admin.user.created`, `admin.user.role_changed`, `admin.user.reset_password` (plus existing block/plan/credit audits)
- Activity item shape: `{ id, type, occurredAt, summary, metadata }` with types `audit | credit | api_request | ai_request | session`
- Session activity = `Session.createdAt` rows for that user
- YAGNI: no `mustChangePassword`, no soft-delete APIs, no `UserActivity` table

## File map

| File | Responsibility |
|------|----------------|
| `src/admin/admin.dto.ts` | Query/create/role/password/activity DTOs |
| `src/admin/admin.service.ts` | List filters, enriched get, create, reset password, change role, role policy helpers |
| `src/admin/admin-activity.service.ts` | Merge timeline from five sources + cursor pagination |
| `src/admin/admin.controller.ts` | Wire new user routes + activity |
| `src/admin/admin.module.ts` | Register activity service; import `CreditsModule` |
| `src/admin/admin.service.spec.ts` | Unit tests for user admin mutations/filters |
| `src/admin/admin-activity.service.spec.ts` | Unit tests for merge/sort/cursor |
| `src/audit/audit.service.ts` | Add `list()` query method |
| `src/audit/admin-audit.controller.ts` | `GET /api/v1/admin/audit-logs` |
| `src/audit/audit.dto.ts` | Audit list query DTO |
| `src/audit/audit.module.ts` | Register controller + export list capability |
| `src/audit/audit.service.spec.ts` | Unit tests for list filters |
| `docs/ADMIN_PANEL_API.md` | Panel API contract |
| `http/admin.http` | Sample requests |
| `README.md` | Link to admin panel API doc |

---

### Task 1: User query filters + enriched get

**Files:**
- Modify: `src/admin/admin.dto.ts`
- Modify: `src/admin/admin.service.ts`
- Create: `src/admin/admin.service.spec.ts`
- Modify: `src/admin/admin.module.ts` (only if needed later; skip here)

**Interfaces:**
- Consumes: existing `UserQueryDto`, `select`, `PrismaService`
- Produces: `UserQueryDto` with optional `role`/`status`/`plan`; `AdminService.get` returns user + `creditAccount` summary; `AdminService.list` applies filters

- [ ] **Step 1: Write failing tests for list filters and enriched get**

Create `src/admin/admin.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
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
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
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
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx jest src/admin/admin.service.spec.ts -v`

Expected: FAIL (constructor arity / missing filters / no `creditAccount`)

- [ ] **Step 3: Implement DTOs + service changes**

Extend `UserQueryDto` in `admin.dto.ts`:

```typescript
import { UserPlan, UserRole, UserStatus } from '@prisma/client';
// ... existing imports ...

// on UserQueryDto add:
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: UserPlan })
  @IsOptional()
  @IsEnum(UserPlan)
  plan?: UserPlan;
```

Update `AdminService` constructor to inject `CreditService` from `../credits/credit.service`.

Update `list` where:

```typescript
const where: Prisma.UserWhereInput = {
  ...(query.role ? { role: query.role } : {}),
  ...(query.status ? { status: query.status } : {}),
  ...(query.plan ? { plan: query.plan } : {}),
  ...(query.search
    ? {
        OR: [
          {
            email: {
              contains: query.search.toLowerCase(),
              mode: 'insensitive' as const,
            },
          },
          {
            displayName: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
        ],
      }
    : {}),
};
```

Update `get`:

```typescript
async get(id: string) {
  const user = await this.prisma.user.findUnique({ where: { id }, select });
  if (!user) throw new NotFoundException('User not found');
  const account = await this.credits.getOrCreateAccount(id);
  return {
    ...user,
    creditAccount: {
      availableBalance: account.availableBalance,
      reservedBalance: account.reservedBalance,
      lifetimePurchased: account.lifetimePurchased,
      lifetimeConsumed: account.lifetimeConsumed,
    },
  };
}
```

Import `CreditsModule` in `admin.module.ts` and keep providers as-is for now:

```typescript
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [CreditsModule],
  controllers: [AdminController, AdminDashboardController],
  providers: [AdminService, AdminDashboardService],
})
export class AdminModule {}
```

Fix `AdminDashboardService` / any other `new AdminService` construction in tests if constructor changes break them (dashboard does not construct AdminService).

- [ ] **Step 4: Run tests — expect pass**

Run: `npx jest src/admin/admin.service.spec.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/admin.dto.ts src/admin/admin.service.ts src/admin/admin.service.spec.ts src/admin/admin.module.ts
git commit -m "feat(admin): filter users and include credit summary on get"
```

---

### Task 2: Create user (with role policy)

**Files:**
- Modify: `src/admin/admin.dto.ts`
- Modify: `src/admin/admin.service.ts`
- Modify: `src/admin/admin.controller.ts`
- Modify: `src/admin/admin.service.spec.ts`

**Interfaces:**
- Consumes: `CreditService.getOrCreateAccount`, `AuditService.record`, `normalizeEmail`, argon2id, `assertCanCreateRole`
- Produces: `AdminService.create(actor, dto)` → public user fields + creditAccount; `POST /api/v1/admin/users`

- [ ] **Step 1: Write failing tests for create + role policy**

Append to `admin.service.spec.ts`:

```typescript
describe('AdminService create', () => {
  const actorAdmin = { userId: 'admin1', role: UserRole.ADMIN } as const;
  const actorSuper = { userId: 'super1', role: UserRole.SUPER_ADMIN } as const;

  function build(prisma: object, credits = { getOrCreateAccount: jest.fn().mockResolvedValue({
    availableBalance: 0, reservedBalance: 0, lifetimePurchased: 0, lifetimeConsumed: 0,
  }) }) {
    return new AdminService(
      prisma as never,
      { record: jest.fn() } as never,
      { get: jest.fn() } as never,
      credits as never,
    );
  }

  it('forbids ADMIN creating ADMIN', async () => {
    const service = build({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
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
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx jest src/admin/admin.service.spec.ts -v`

Expected: FAIL (`create` missing)

- [ ] **Step 3: Implement DTO, service, controller**

Add to `admin.dto.ts`:

```typescript
import { Length, Matches, MaxLength, IsEmail, IsString } from 'class-validator';
import { PASSWORD_PATTERN } from '../auth/auth.dto';

export class AdminCreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'StrongPass123', minLength: 10, maxLength: 128 })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain uppercase, lowercase, and numeric characters',
  })
  password!: string;

  @ApiPropertyOptional({ example: 'Name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ enum: UserPlan, default: UserPlan.FREE })
  @IsOptional()
  @IsEnum(UserPlan)
  plan?: UserPlan;
}
```

In `admin.service.ts`:

```typescript
import {
  ConflictException,
  ForbiddenException,
  // ...
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { normalizeEmail } from '../common/security';
import { CreditService } from '../credits/credit.service';

private assertCanAssignRole(actor: AccessPrincipal, role: UserRole) {
  if (actor.role === UserRole.SUPER_ADMIN) return;
  if (role === UserRole.USER || role === UserRole.REVIEWER) return;
  throw new ForbiddenException(
    'Only a super administrator can assign administrator roles',
  );
}

async create(
  actor: AccessPrincipal,
  dto: {
    email: string;
    password: string;
    displayName?: string;
    role: UserRole;
    plan?: UserPlan;
  },
) {
  this.assertCanAssignRole(actor, dto.role);
  const email = normalizeEmail(dto.email);
  const existing = await this.prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictException('Unable to create account');
  const passwordHash = await argon2.hash(dto.password, {
    type: argon2.argon2id,
  });
  const user = await this.prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: dto.displayName?.trim(),
      role: dto.role,
      plan: dto.plan ?? UserPlan.FREE,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
    select,
  });
  const account = await this.credits.getOrCreateAccount(user.id);
  this.audit.record('admin.user.created', actor.userId, user.id, 'User', {
    role: user.role,
    plan: user.plan,
  });
  return {
    ...user,
    creditAccount: {
      availableBalance: account.availableBalance,
      reservedBalance: account.reservedBalance,
      lifetimePurchased: account.lifetimePurchased,
      lifetimeConsumed: account.lifetimeConsumed,
    },
  };
}
```

In `admin.controller.ts` add **before** `:userId` routes if needed (POST `/` is fine at class root):

```typescript
@Post()
async create(
  @CurrentUser() actor: AccessPrincipal,
  @Body() dto: AdminCreateUserDto,
) {
  return response(await this.admin.create(actor, dto));
}
```

Import `AdminCreateUserDto`.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx jest src/admin/admin.service.spec.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/admin.dto.ts src/admin/admin.service.ts src/admin/admin.controller.ts src/admin/admin.service.spec.ts
git commit -m "feat(admin): allow admins to create users with role policy"
```

---

### Task 3: Reset password + change role

**Files:**
- Modify: `src/admin/admin.dto.ts`
- Modify: `src/admin/admin.service.ts`
- Modify: `src/admin/admin.controller.ts`
- Modify: `src/admin/admin.service.spec.ts`

**Interfaces:**
- Consumes: `assertCanAlter`, `assertCanAssignRole`, argon2, session revoke
- Produces: `resetPassword(actor, id, newPassword)`, `changeRole(actor, id, role)`; routes `POST :userId/reset-password`, `PATCH :userId/role` with `@Roles(SUPER_ADMIN)` on change-role

- [ ] **Step 1: Write failing tests**

```typescript
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
      undefined,
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
```

Import `ForbiddenException` at top of spec.

- [ ] **Step 2: Run tests — expect fail**

Run: `npx jest src/admin/admin.service.spec.ts -v`

Expected: FAIL (methods missing)

- [ ] **Step 3: Implement**

DTOs:

```typescript
export class AdminResetPasswordDto {
  @ApiProperty({ example: 'StrongPass123', minLength: 10, maxLength: 128 })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain uppercase, lowercase, and numeric characters',
  })
  newPassword!: string;
}

export class ChangeUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
```

Service methods:

```typescript
async resetPassword(
  actor: AccessPrincipal,
  id: string,
  newPassword: string,
) {
  await this.assertCanAlter(actor, id);
  const passwordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
  });
  const user = await this.prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { passwordHash },
      select,
    });
    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return updated;
  });
  this.audit.record('admin.user.reset_password', actor.userId, id, 'User');
  return { id: user.id, message: 'Password reset successfully' };
}

async changeRole(actor: AccessPrincipal, id: string, role: UserRole) {
  if (actor.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException(
      'Only a super administrator can change roles',
    );
  }
  await this.assertCanAlter(actor, id);
  this.assertCanAssignRole(actor, role);
  const user = await this.prisma.user.update({
    where: { id },
    data: { role },
    select,
  });
  this.audit.record('admin.user.role_changed', actor.userId, id, 'User', {
    role,
  });
  return user;
}
```

Controller (place `activity`/`reset-password`/`role` routes near other `:userId` mutations):

```typescript
@Post(':userId/reset-password')
@HttpCode(HttpStatus.OK)
async resetPassword(
  @CurrentUser() actor: AccessPrincipal,
  @Param('userId', ParseUUIDPipe) id: string,
  @Body() dto: AdminResetPasswordDto,
) {
  return response(await this.admin.resetPassword(actor, id, dto.newPassword));
}

@Patch(':userId/role')
@Roles(UserRole.SUPER_ADMIN)
async changeRole(
  @CurrentUser() actor: AccessPrincipal,
  @Param('userId', ParseUUIDPipe) id: string,
  @Body() dto: ChangeUserRoleDto,
) {
  return response(await this.admin.changeRole(actor, id, dto.role));
}
```

Note: class-level `@Roles(ADMIN, SUPER_ADMIN)` plus method `@Roles(SUPER_ADMIN)` — `getAllAndOverride` uses handler first, so method metadata wins. Good.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx jest src/admin/admin.service.spec.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/admin.dto.ts src/admin/admin.service.ts src/admin/admin.controller.ts src/admin/admin.service.spec.ts
git commit -m "feat(admin): add password reset and super-admin role change"
```

---

### Task 4: Unified user activity timeline

**Files:**
- Create: `src/admin/admin-activity.service.ts`
- Create: `src/admin/admin-activity.service.spec.ts`
- Modify: `src/admin/admin.dto.ts` (activity query DTO)
- Modify: `src/admin/admin.controller.ts`
- Modify: `src/admin/admin.module.ts`

**Interfaces:**
- Consumes: Prisma models listed in spec
- Produces: `AdminActivityService.list(userId, query) => { items, meta: { nextCursor?, limit } }`
- Activity types union: `'audit' | 'credit' | 'api_request' | 'ai_request' | 'session'`

- [ ] **Step 1: Write failing merge/sort/cursor tests**

Create `src/admin/admin-activity.service.spec.ts`:

```typescript
import { AdminActivityService } from './admin-activity.service';

describe('AdminActivityService', () => {
  it('merges sources newest-first and respects limit', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            action: 'user.blocked',
            createdAt: new Date('2026-08-02T00:00:00Z'),
            metadata: null,
            actorId: 'admin',
            targetType: 'User',
            targetId: 'u1',
          },
        ]),
      },
      creditLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            type: 'ADMIN_GRANT',
            amount: 50,
            createdAt: new Date('2026-08-03T00:00:00Z'),
            description: 'bonus',
          },
        ]),
      },
      apiRequestRecord: { findMany: jest.fn().mockResolvedValue([]) },
      aiRequest: { findMany: jest.fn().mockResolvedValue([]) },
      session: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's1',
            createdAt: new Date('2026-08-01T00:00:00Z'),
            ipAddress: '1.1.1.1',
            userAgent: 'ua',
            clientType: 'WEB',
          },
        ]),
      },
    };
    const service = new AdminActivityService(prisma as never);
    const result = await service.list('u1', { limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].type).toBe('credit');
    expect(result.items[1].type).toBe('audit');
    expect(result.meta.nextCursor).toBeTruthy();
  });

  it('filters by types', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      auditLog: { findMany: jest.fn() },
      creditLedgerEntry: { findMany: jest.fn() },
      apiRequestRecord: { findMany: jest.fn() },
      aiRequest: { findMany: jest.fn() },
      session: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's1',
            createdAt: new Date('2026-08-01T00:00:00Z'),
            ipAddress: null,
            userAgent: null,
            clientType: 'WEB',
          },
        ]),
      },
    };
    const service = new AdminActivityService(prisma as never);
    const result = await service.list('u1', {
      limit: 10,
      types: ['session'],
    });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    expect(result.items[0].type).toBe('session');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx jest src/admin/admin-activity.service.spec.ts -v`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement service + DTO + route**

`admin.dto.ts`:

```typescript
import { IsArray, IsUUID } from 'class-validator'; // IsUUID only if needed

export const ACTIVITY_TYPES = [
  'audit',
  'credit',
  'api_request',
  'ai_request',
  'session',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export class UserActivityQueryDto {
  @ApiPropertyOptional({ example: 30, default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ApiPropertyOptional({ description: 'Opaque cursor from previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: ACTIVITY_TYPES,
    description: 'Repeatable ?types=audit&types=credit or comma-separated',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    return value;
  })
  @IsArray()
  @IsIn(ACTIVITY_TYPES, { each: true })
  types?: ActivityType[];
}
```

`admin-activity.service.ts` (v1: over-fetch `limit` per enabled source, merge, sort, slice, encode next cursor as base64url JSON `{ t, id, type }`):

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityType } from './admin.dto';

export type ActivityItem = {
  id: string;
  type: ActivityType;
  occurredAt: string;
  summary: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class AdminActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: { limit?: number; cursor?: string; types?: ActivityType[] },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const limit = query.limit ?? 30;
    const types = new Set(
      query.types?.length
        ? query.types
        : (['audit', 'credit', 'api_request', 'ai_request', 'session'] as ActivityType[]),
    );
    const take = limit + 1;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const buckets: ActivityItem[] = [];

    if (types.has('audit')) {
      const rows = await this.prisma.auditLog.findMany({
        where: { targetType: 'User', targetId: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'audit',
          occurredAt: row.createdAt.toISOString(),
          summary: row.action,
          metadata: {
            actorId: row.actorId,
            targetType: row.targetType,
            targetId: row.targetId,
            metadata: row.metadata,
          },
        });
      }
    }

    if (types.has('credit')) {
      const rows = await this.prisma.creditLedgerEntry.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'credit',
          occurredAt: row.createdAt.toISOString(),
          summary: `${row.type} ${row.amount}`,
          metadata: {
            type: row.type,
            amount: row.amount,
            description: row.description,
          },
        });
      }
    }

    if (types.has('api_request')) {
      const rows = await this.prisma.apiRequestRecord.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'api_request',
          occurredAt: row.createdAt.toISOString(),
          summary: `${row.method} ${row.route} → ${row.statusCode}`,
          metadata: {
            requestId: row.requestId,
            method: row.method,
            route: row.route,
            statusCode: row.statusCode,
            durationMs: row.durationMs,
          },
        });
      }
    }

    if (types.has('ai_request')) {
      const rows = await this.prisma.aiRequest.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'ai_request',
          occurredAt: row.createdAt.toISOString(),
          summary: `${row.provider}/${row.model} ${row.status}`,
          metadata: {
            provider: row.provider,
            model: row.model,
            status: row.status,
            operation: row.operation,
            chargedCreditAmount: row.chargedCreditAmount,
          },
        });
      }
    }

    if (types.has('session')) {
      const rows = await this.prisma.session.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'session',
          occurredAt: row.createdAt.toISOString(),
          summary: `session ${row.clientType}`,
          metadata: {
            clientType: row.clientType,
            ipAddress: row.ipAddress,
            userAgent: row.userAgent,
            revokedAt: row.revokedAt,
          },
        });
      }
    }

    buckets.sort((a, b) => {
      const t = b.occurredAt.localeCompare(a.occurredAt);
      if (t !== 0) return t;
      return b.id.localeCompare(a.id);
    });

    let filtered = buckets;
    if (cursor) {
      filtered = buckets.filter((item) => {
        if (item.occurredAt < cursor.t) return true;
        if (item.occurredAt > cursor.t) return false;
        if (item.id < cursor.id) return true;
        if (item.id > cursor.id) return false;
        return item.type < cursor.type;
      });
    }

    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const last = page[page.length - 1];
    return {
      items: page,
      meta: {
        limit,
        nextCursor:
          hasMore && last
            ? this.encodeCursor({
                t: last.occurredAt,
                id: last.id,
                type: last.type,
              })
            : null,
      },
    };
  }

  private encodeCursor(c: { t: string; id: string; type: string }) {
    return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
  }

  private decodeCursor(raw: string): { t: string; id: string; type: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as { t: string; id: string; type: string };
      if (!parsed?.t || !parsed?.id || !parsed?.type) throw new Error('bad');
      return parsed;
    } catch {
      throw new (require('@nestjs/common').BadRequestException)(
        'Invalid activity cursor',
      );
    }
  }
}
```

Prefer proper `BadRequestException` import instead of `require` in real code.

Register provider; controller:

```typescript
@Get(':userId/activity')
async activity(
  @Param('userId', ParseUUIDPipe) id: string,
  @Query() query: UserActivityQueryDto,
) {
  const result = await this.activity.list(id, query);
  return response(result.items, result.meta);
}
```

Inject `AdminActivityService` into `AdminController`. Add to module providers.

Place `@Get(':userId/activity')` **before** `@Get(':userId')` is optional in Nest (static segment `activity` distinguishes paths).

- [ ] **Step 4: Run tests — expect pass**

Run: `npx jest src/admin/admin-activity.service.spec.ts src/admin/admin.service.spec.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/admin-activity.service.ts src/admin/admin-activity.service.spec.ts src/admin/admin.dto.ts src/admin/admin.controller.ts src/admin/admin.module.ts
git commit -m "feat(admin): add unified user activity timeline"
```

---

### Task 5: Audit log list API

**Files:**
- Create: `src/audit/audit.dto.ts`
- Create: `src/audit/admin-audit.controller.ts`
- Create: `src/audit/audit.service.spec.ts`
- Modify: `src/audit/audit.service.ts`
- Modify: `src/audit/audit.module.ts`

**Interfaces:**
- Consumes: `AuditLog` model
- Produces: `AuditService.list(query)`; `GET /api/v1/admin/audit-logs`

- [ ] **Step 1: Write failing list tests**

```typescript
import { AuditService } from './audit.service';

describe('AuditService.list', () => {
  it('applies action/actor/target/date filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
      auditLog: { findMany, count },
    };
    const service = new AuditService(prisma as never);
    await service.list({
      page: 1,
      limit: 20,
      action: 'user.blocked',
      actorId: '11111111-1111-1111-1111-111111111111',
      targetType: 'User',
      targetId: 'u1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-28T00:00:00.000Z',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'user.blocked',
          actorId: '11111111-1111-1111-1111-111111111111',
          targetType: 'User',
          targetId: 'u1',
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx jest src/audit/audit.service.spec.ts -v`

Expected: FAIL

- [ ] **Step 3: Implement list + controller**

`audit.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AuditLogQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
```

Add to `AuditService`:

```typescript
async list(query: {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}) {
  const where = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await this.prisma.$transaction([
    this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    this.prisma.auditLog.count({ where }),
  ]);
  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit) || 0,
    },
  };
}
```

`admin-audit.controller.ts`:

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import { Roles } from '../common/decorators';
import { AuditLogQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    const result = await this.audit.list(query);
    return response(result.items, result.meta);
  }
}
```

Register controller in `AuditModule`:

```typescript
import { AdminAuditController } from './admin-audit.controller';

@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx jest src/audit/audit.service.spec.ts src/admin -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audit/audit.dto.ts src/audit/admin-audit.controller.ts src/audit/audit.service.ts src/audit/audit.module.ts src/audit/audit.service.spec.ts
git commit -m "feat(audit): add admin audit log list endpoint"
```

---

### Task 6: Panel API documentation + http samples

**Files:**
- Create: `docs/ADMIN_PANEL_API.md`
- Modify: `http/admin.http`
- Modify: `README.md` (short link near existing admin mentions ~line 136 or 283)

**Interfaces:**
- Consumes: all endpoints from spec + existing admin routes
- Produces: frontend-ready contract doc

- [ ] **Step 1: Write `docs/ADMIN_PANEL_API.md`**

Include sections:

1. Auth / roles / envelope
2. Users (list filters, get+credit, create, block/unblock, plan, role, reset-password)
3. Credits (point to existing grant/deduct/transactions/packages/orders paths with example bodies matching `http/admin.http`)
4. User activity timeline
5. Audit logs
6. API requests + AI requests (paths only + link `docs/API_USAGE_ADMIN.md` if present)
7. Dashboard
8. Error table (400/403/404/409)

Document exact paths under `/api/v1/admin/...`.

- [ ] **Step 2: Extend `http/admin.http`**

Append samples for: create user, change role, reset password, user activity, audit-logs, filtered user list.

- [ ] **Step 3: README pointer**

Near admin frontend / dashboard mention, add:

`Admin panel API contract: [`docs/ADMIN_PANEL_API.md`](docs/ADMIN_PANEL_API.md)`

- [ ] **Step 4: Sanity build**

Run: `npm run build`

Expected: compile success

- [ ] **Step 5: Commit**

```bash
git add docs/ADMIN_PANEL_API.md http/admin.http README.md
git commit -m "docs: add admin panel API contract and http samples"
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| List filters role/status/plan | 1 |
| Get + creditAccount | 1 |
| Create user + ACTIVE/verified + credit account | 2 |
| Role assign policy ADMIN vs SUPER_ADMIN | 2, 3 |
| Reset password + revoke sessions | 3 |
| Change role SUPER_ADMIN only | 3 |
| Unified activity timeline + types + cursor | 4 |
| Separate audit list API | 5 |
| Docs + http + README | 6 |
| Keep existing credit/API/AI/dashboard | documented in 6; no code breaks |
| Audit action names for new mutations | 2, 3 |

No TBD placeholders. Method names aligned across tasks: `create`, `resetPassword`, `changeRole`, `AdminActivityService.list`, `AuditService.list`.
