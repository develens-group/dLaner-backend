import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplatesService } from './templates.service';

describe('TemplatesService.createBulk', () => {
  const ownerId = 'owner-1';
  const libraryOf = (id: string, name: string) => ({
    type: 'dlanderlib',
    version: 2,
    source: 'dlander',
    libraryItems: [
      {
        id,
        status: 'unpublished' as const,
        name,
        elements: [],
      },
    ],
  });

  function buildMocks(opts?: { failVersionOn?: number }) {
    const templates = new Map<
      string,
      {
        id: string;
        ownerId: string;
        title: string;
        slug: string;
        deletedAt: Date | null;
        reviewStatus: string;
        currentVersion: unknown;
        category: null;
        visibility: string;
        tags: string[];
      }
    >();
    let seq = 0;
    let versionCalls = 0;

    const prisma = {
      template: {
        create: jest.fn(
          async ({
            data,
          }: {
            data: { title: string; slug: string; ownerId: string };
          }) => {
            const id = `tpl-${++seq}`;
            const row = {
              id,
              ownerId: data.ownerId,
              title: data.title,
              slug: data.slug,
              deletedAt: null,
              reviewStatus: 'DRAFT',
              currentVersion: null,
              category: null,
              visibility: 'PRIVATE',
              tags: [] as string[],
            };
            templates.set(id, row);
            return row;
          },
        ),
        findFirst: jest.fn(
          async ({
            where,
            include,
          }: {
            where: { id: string; ownerId?: string; deletedAt?: null };
            include?: unknown;
          }) => {
            const row = templates.get(where.id);
            if (!row || row.deletedAt) return null;
            if (where.ownerId && row.ownerId !== where.ownerId) return null;
            if (include) return { ...row };
            return row;
          },
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const row = templates.get(where.id);
            if (!row) throw new Error('missing');
            Object.assign(row, data);
            if (data.currentVersionId) {
              row.currentVersion = {
                id: data.currentVersionId,
                previewStorageKey: null,
                items: [],
              };
            }
            return row;
          },
        ),
      },
      templateVersion: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: { templateId: string } }) => {
          versionCalls += 1;
          if (opts?.failVersionOn === versionCalls)
            throw new Error('version boom');
          return {
            id: `ver-${versionCalls}`,
            templateId: data.templateId,
            versionNumber: 1,
            previewStorageKey: null,
            items: [],
          };
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          templateVersion: prisma.templateVersion,
          template: prisma.template,
        }),
      ),
    };

    const storage = {
      putObject: jest.fn(async () => undefined),
      deleteObject: jest.fn(async () => undefined),
    };

    const service = new TemplatesService(
      prisma as never,
      new ConfigService({ TEMPLATE_MAX_BUNDLE_BYTES: 5_000_000 }),
      storage as never,
    );

    return { service, templates, prisma, storage };
  }

  it('rejects empty items', async () => {
    const { service } = buildMocks();
    await expect(
      service.createBulk(ownerId, { items: [] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates one template per item', async () => {
    const { service, templates } = buildMocks();
    const out = await service.createBulk(ownerId, {
      visibility: 'PRIVATE' as never,
      changelog: 'bulk',
      items: [
        { title: 'One', library: libraryOf('a', 'Item A') },
        { title: 'Two', library: libraryOf('b', 'Item B') },
      ],
    });
    expect(out).toHaveLength(2);
    expect([...templates.values()].map((t) => t.title)).toEqual(['One', 'Two']);
    expect(out.every((t) => t.currentVersion)).toBe(true);
  });

  it('soft-deletes created templates when a later item fails', async () => {
    const { service, templates } = buildMocks({ failVersionOn: 2 });
    await expect(
      service.createBulk(ownerId, {
        visibility: 'PRIVATE' as never,
        items: [
          { title: 'One', library: libraryOf('a', 'Item A') },
          { title: 'Two', library: libraryOf('b', 'Item B') },
        ],
      }),
    ).rejects.toThrow('version boom');

    expect([...templates.values()].every((t) => t.deletedAt != null)).toBe(
      true,
    );
  });
});

describe('TemplatesService payload security', () => {
  const service = new TemplatesService(
    {} as never,
    new ConfigService({
      TEMPLATE_MAX_ITEMS: 2,
      TEMPLATE_MAX_ELEMENTS_PER_ITEM: 2,
    }),
    {} as never,
  );
  const validate = (value: unknown) =>
    (
      service as unknown as { validateLibrary(v: unknown): void }
    ).validateLibrary(value);
  it('accepts unicode and valid library items', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'تست',
        libraryItems: [
          {
            id: '۱',
            status: 'unpublished',
            created: 1,
            name: 'فارسی',
            elements: [],
          },
        ],
      }),
    ).not.toThrow());
  it('rejects missing item names', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [{ id: 'a', status: 'published', elements: [] }],
      }),
    ).toThrow('Item name is required'));
  it('decodes preview base64 with declared mime', () => {
    const png1x1 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const resolve = (
      service as unknown as {
        resolvePreviewInput(
          file: undefined,
          dto: {
            previewImageBase64?: string;
            previewImageType?: string;
          },
        ): { buffer: Buffer; mime: string } | undefined;
      }
    ).resolvePreviewInput.bind(service);
    const out = resolve(undefined, {
      previewImageBase64: png1x1,
      previewImageType: 'image/png',
    });
    expect(out?.mime).toBe('image/png');
    expect(out?.buffer.length).toBeGreaterThan(10);
  });
  it('rejects duplicate item ids', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [
          { id: 'a', status: 'published', name: 'A', elements: [] },
          { id: 'a', status: 'published', name: 'B', elements: [] },
        ],
      }),
    ).toThrow('Duplicate item id'));
  it('rejects oversized element arrays', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [
          { id: 'a', status: 'published', name: 'A', elements: [1, 2, 3] },
        ],
      }),
    ).toThrow('Invalid element count'));
  it('rejects prototype-pollution keys', () => {
    const elements: unknown = JSON.parse('[{"constructor":{"polluted":true}}]');
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [
          { id: 'a', status: 'published', name: 'A', elements },
        ],
      }),
    ).toThrow('Unsafe object key');
  });
});
