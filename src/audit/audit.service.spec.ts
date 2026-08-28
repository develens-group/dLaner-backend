import { AuditService } from './audit.service';

describe('AuditService.list', () => {
  it('applies action/actor/target/date filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: jest.fn((ops: unknown[]) =>
        Promise.all(ops as Promise<unknown>[]),
      ),
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
