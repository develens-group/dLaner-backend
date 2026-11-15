import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LandsService } from './lands.service';

describe('MCP land revision concurrency', () => {
  function fixture(currentRevision: number) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      land: {
        findFirst: jest.fn().mockResolvedValue({ id: 'land' }),
        update: jest.fn().mockResolvedValue({}),
      },
      landRevision: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { revision: currentRevision } }),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: object }) =>
            Promise.resolve({ id: 'new-revision', ...data }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      land: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'land',
          currentRevision: { revision: currentRevision },
        }),
      },
      landRevision: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockImplementation((work: (tx: unknown) => Promise<unknown>) =>
          work(tx),
        ),
    };
    const storage = {
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new LandsService(
      prisma as never,
      new ConfigService(),
      storage as never,
      { assertCanStore: jest.fn() } as never,
    );
    return { service, tx, storage };
  }

  it('checks expected revision inside the lock and cleans up the unused upload on conflict', async () => {
    const f = fixture(4);
    await expect(
      f.service.save('owner', 'land', { elements: [] }, 3),
    ).rejects.toThrow(ConflictException);
    expect(f.tx.$executeRaw).toHaveBeenCalled();
    expect(f.tx.landRevision.create).not.toHaveBeenCalled();
    expect(f.tx.land.update).not.toHaveBeenCalled();
    expect(f.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('saves a matching revision and keeps existing web calls compatible', async () => {
    const f = fixture(4);
    expect(
      await f.service.save('owner', 'land', { elements: [] }, 4),
    ).toMatchObject({ revision: 5 });
    expect(
      await f.service.save('owner', 'land', { elements: [] }),
    ).toMatchObject({ revision: 5 });
  });
});
