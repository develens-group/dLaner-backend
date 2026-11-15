import { ConfigService } from '@nestjs/config';
import { EditSessionService } from './edit-session.service';

describe('WordPress edit completion concurrency', () => {
  it('does not overwrite output after another request completed the session', async () => {
    const prisma = {
      wordPressEditSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session',
          userId: 'owner',
          status: 'OPEN',
          expiresAt: new Date(Date.now() + 60000),
        }),
        updateMany: jest
          .fn<
            Promise<{ count: number }>,
            [{ where: { userId: string; status: string } }]
          >()
          .mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
    };
    const edits = new EditSessionService(
      prisma as never,
      new ConfigService(),
      {} as never,
    );
    await expect(
      edits.complete('session', 'owner', { outputText: 'revised' }),
    ).rejects.toThrow('Edit session changed or expired');
    expect(
      prisma.wordPressEditSession.updateMany.mock.calls[0][0].where.userId,
    ).toBe('owner');
    expect(
      prisma.wordPressEditSession.updateMany.mock.calls[0][0].where.status,
    ).toBe('OPEN');
    expect(
      prisma.wordPressEditSession.findUniqueOrThrow,
    ).not.toHaveBeenCalled();
  });
});
