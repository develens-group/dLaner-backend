import { WordPressContentService } from './wordpress-content.service';
import { startSync, syncBatch } from './wordpress-content.schema';
const site = {
  id: 'site',
  userId: 'owner',
  domain: 'example.test',
  enabled: true,
  contentSnapshotId: 'active',
};
const fixture = () => {
  const snapshot = {
    id: 'upload',
    siteId: 'site',
    status: 'UPLOADING',
    expectedItems: 2,
    includeUnpublished: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60000),
  };
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    wordPressSite: {
      findFirst: jest.fn().mockResolvedValue(site),
      update: jest.fn().mockResolvedValue(site),
    },
    wordPressContentSnapshot: {
      create: jest.fn().mockResolvedValue(snapshot),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(snapshot),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ ...snapshot, status: 'READY' }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    wordPressContentItem: {
      count: jest.fn().mockResolvedValue(2),
      upsert: jest.fn().mockResolvedValue({}),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _count: 2, _sum: { sizeBytes: 100 } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (work: (tx: unknown) => Promise<unknown>) => work(prisma),
  );
  return {
    prisma,
    snapshot,
    content: new WordPressContentService(prisma as never),
  };
};
describe('WordPress content synchronization', () => {
  it('rejects secret settings and script URLs at the schema boundary', () => {
    expect(
      startSync.safeParse({
        expectedItems: 1,
        siteInfo: {
          title: 'Site',
          homeUrl: 'https://example.test',
          password: 'secret',
        },
      }).success,
    ).toBe(false);
    expect(
      syncBatch.safeParse({
        items: [
          {
            kind: 'page',
            externalId: '1',
            data: { title: 'Page', url: 'javascript:alert(1)' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      syncBatch.safeParse({
        items: [
          {
            kind: 'page',
            externalId: '1',
            data: { title: 'Page', apiKey: 'secret' },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('starts only a package belonging to the installation domain', async () => {
    const f = fixture();
    await expect(
      f.content.start(site as never, {
        expectedItems: 1,
        siteInfo: { title: 'Site', homeUrl: 'https://another.test' },
      }),
    ).rejects.toThrow('does not match');
    expect(f.prisma.wordPressContentSnapshot.create).not.toHaveBeenCalled();
    await f.content.start(site as never, {
      expectedItems: 1,
      siteInfo: { title: 'Site', homeUrl: 'https://example.test' },
    });
    expect(f.prisma.$executeRaw).toHaveBeenCalled();
  });
  it('rejects unpublished items when the manifest does not opt in', async () => {
    const f = fixture();
    await expect(
      f.content.batch(site as never, 'upload', {
        items: [
          {
            kind: 'page',
            externalId: '1',
            status: 'private',
            data: { title: 'Private' },
          },
        ],
      }),
    ).rejects.toThrow('published content only');
    expect(f.prisma.wordPressContentItem.upsert).not.toHaveBeenCalled();
  });
  it('does not activate partial uploads', async () => {
    const f = fixture();
    f.prisma.wordPressContentItem.count.mockResolvedValue(1);
    await expect(f.content.complete(site as never, 'upload')).rejects.toThrow(
      'Upload all declared records',
    );
    expect(f.prisma.wordPressSite.update).not.toHaveBeenCalled();
  });
  it('activates a complete snapshot only for its connected installation', async () => {
    const f = fixture();
    const result = await f.content.complete(site as never, 'upload');
    expect(result.status).toBe('READY');
    expect(f.prisma.wordPressSite.update).toHaveBeenCalledWith({
      where: { id: 'site' },
      data: { contentSnapshotId: 'upload' },
    });
    expect(f.prisma.wordPressContentSnapshot.findFirst).toHaveBeenCalledWith({
      where: { id: 'upload', siteId: 'site' },
    });
  });
  it('does not let an older completed copy replace a newer copy', async () => {
    const f = fixture();
    f.prisma.wordPressContentSnapshot.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() + 10000),
      id: 'newer',
    });
    await expect(f.content.complete(site as never, 'upload')).rejects.toThrow(
      'newer snapshot',
    );
    expect(f.prisma.wordPressSite.update).not.toHaveBeenCalled();
  });
  it('filters web requests by owner and enabled state', async () => {
    const f = fixture();
    f.prisma.wordPressSite.findFirst.mockResolvedValue(null);
    await expect(f.content.summary('another-user', 'site')).rejects.toThrow(
      'not found',
    );
    expect(f.prisma.wordPressSite.findFirst).toHaveBeenCalledWith({
      where: { id: 'site', userId: 'another-user', enabled: true },
    });
    expect(f.prisma.wordPressContentSnapshot.findFirst).not.toHaveBeenCalled();
  });
  it('aborts only unfinished content of the same installation', async () => {
    const f = fixture();
    await f.content.abort(site as never, 'upload');
    expect(f.prisma.wordPressContentSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { id: 'upload', siteId: 'site', status: 'UPLOADING' },
    });
  });
});
