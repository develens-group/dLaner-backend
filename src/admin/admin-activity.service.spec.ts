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
            revokedAt: null,
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
            revokedAt: null,
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
