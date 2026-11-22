/* Test doubles intentionally model storage and Prisma delegates. */
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { Readable } from 'node:stream';
import { LandImagesService } from './land-images.service';
import { downloadAssistantImage } from './download-assistant-image';
jest.mock('./download-assistant-image', () => ({
  ...jest.requireActual('./download-assistant-image'),
  downloadAssistantImage: jest.fn(),
}));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAmkAAAAASUVORK5CYII=',
  'base64',
);
function fixture() {
  const canvas = {
    elements: [
      {
        id: 'car',
        type: 'image',
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        fileId: 'original',
        version: 3,
      },
    ],
    appState: { viewBackgroundColor: '#fff' },
    files: {
      original: {
        id: 'original',
        dataURL: `data:image/png;base64,${png.toString('base64')}`,
      },
    },
  };
  const lands = {
    get: jest.fn(async () => ({ currentRevision: { revision: 2 } })),
    canvas: jest.fn(async () => ({
      revision: { revision: 2 },
      object: { stream: Readable.from([JSON.stringify(canvas)]) },
    })),
    save: jest.fn(async () => ({ revision: 3 })),
  };
  const prisma: any = {
    landImage: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({
        ...data,
        createdAt: new Date(),
      })),
      update: jest.fn(),
      findMany: jest.fn(async () => []),
      delete: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  const storage = {
    putObject: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    streamObject: jest.fn(async () => ({ stream: Readable.from([png]) })),
    createSignedDownloadUrl: jest.fn(async () => 'https://bucket.test/signed'),
  };
  const billing = { assertCanStore: jest.fn() };
  const service = new LandImagesService(
    lands as never,
    prisma,
    billing as never,
    storage as never,
  );
  return { service, lands, prisma, storage, billing, canvas };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(downloadAssistantImage).mockResolvedValue(png);
});
const input = {
  landId: 'land',
  expectedRevision: 2,
  sourceElementId: 'car',
  file: {
    download_url: 'https://files.example/result.png',
    file_id: 'file-result',
  },
};
it('stores the returned file separately and appends beside the original without Base64 in the revision', async () => {
  const f = fixture();
  const result = await f.service.import('owner', input);
  expect(result.revision).toBe(3);
  expect(f.storage.putObject).toHaveBeenCalledTimes(2);
  const saved = f.lands.save.mock.calls[0] as unknown as [
    string,
    string,
    any,
    number,
  ];
  expect(saved[0]).toBe('owner');
  expect(saved[3]).toBe(2);
  expect(saved[2].elements[0]).toEqual(f.canvas.elements[0]);
  expect(saved[2].elements[1]).toMatchObject({
    type: 'image',
    x: 250,
    y: 20,
    width: 200,
    height: 100,
  });
  expect(saved[2].files[result.fileId].landAssetId).toBeTruthy();
  expect(saved[2].files[result.fileId].dataURL).toBeUndefined();
  expect(saved[2].files.original).toEqual(f.canvas.files.original);
  expect(f.billing.assertCanStore).toHaveBeenCalledWith(
    'owner',
    expect.any(Number),
  );
});
it('rejects stale revisions before downloading or writing anything', async () => {
  const f = fixture();
  await expect(
    f.service.import('owner', { ...input, expectedRevision: 1 }),
  ).rejects.toThrow('Land changed');
  expect(downloadAssistantImage).not.toHaveBeenCalled();
  expect(f.storage.putObject).not.toHaveBeenCalled();
});
it('checks ownership before fetching a remote file', async () => {
  const f = fixture();
  f.lands.get.mockRejectedValue(new Error('Land not found'));
  await expect(f.service.import('other', input)).rejects.toThrow(
    'Land not found',
  );
  expect(downloadAssistantImage).not.toHaveBeenCalled();
});
it('deduplicates identical bytes within the land', async () => {
  const f = fixture();
  const asset = {
    id: 'asset',
    storageKey: 'stored',
    previewStorageKey: 'preview',
    mimeType: 'image/png',
    sizeBytes: 100,
    createdAt: new Date(),
  };
  f.prisma.landImage.findUnique.mockResolvedValue(asset);
  f.prisma.landImage.update.mockResolvedValue(asset);
  await f.service.import('owner', input);
  expect(f.storage.putObject).not.toHaveBeenCalled();
  expect(f.billing.assertCanStore).not.toHaveBeenCalled();
});
it('does not store a file when quota is exceeded', async () => {
  const f = fixture();
  f.billing.assertCanStore.mockRejectedValue(
    new Error('Storage quota exceeded'),
  );
  await expect(f.service.import('owner', input)).rejects.toThrow(
    'Storage quota',
  );
  expect(f.storage.putObject).not.toHaveBeenCalled();
});
it('never signs a URL for an asset in another land', async () => {
  const f = fixture();
  f.prisma.landImage.findFirst.mockResolvedValue(null);
  await expect(f.service.download('owner', 'land', 'foreign')).rejects.toThrow(
    'Land image not found',
  );
  expect(f.prisma.landImage.findFirst).toHaveBeenCalledWith({
    where: { id: 'foreign', landId: 'land' },
  });
  expect(f.storage.createSignedDownloadUrl).not.toHaveBeenCalled();
});
it('cleans bucket objects if saving the asset record fails', async () => {
  const f = fixture();
  f.prisma.landImage.create.mockRejectedValue(new Error('database failure'));
  await expect(f.service.import('owner', input)).rejects.toThrow(
    'database failure',
  );
  expect(f.storage.deleteObject).toHaveBeenCalledTimes(2);
});

it('retains an old image referenced by any retained land revision', async () => {
  const f = fixture();
  const asset = {
    id: 'asset',
    landId: 'land',
    storageKey: 'original',
    previewStorageKey: 'preview',
    land: { ownerId: 'owner', deletedAt: null },
  };
  f.prisma.landImage.findMany.mockResolvedValue([asset]);
  f.prisma.landImage.findFirst.mockResolvedValue(asset);
  f.prisma.landRevision = {
    findMany: jest.fn(async () => [{ storageKey: 'revision' }]),
  };
  f.storage.streamObject.mockResolvedValue({
    stream: Readable.from([
      JSON.stringify({ files: { old: { landAssetId: 'asset' } } }),
    ]),
  });
  expect(await f.service.cleanup()).toBe(0);
  expect(f.storage.deleteObject).not.toHaveBeenCalled();
});
it('removes expired unreferenced image bytes and their preview', async () => {
  const f = fixture();
  const asset = {
    id: 'asset',
    landId: 'land',
    storageKey: 'original',
    previewStorageKey: 'preview',
    land: { ownerId: 'owner', deletedAt: null },
  };
  f.prisma.landImage.findMany.mockResolvedValue([asset]);
  f.prisma.landImage.findFirst.mockResolvedValue(asset);
  f.prisma.landRevision = {
    findMany: jest.fn(async () => [{ storageKey: 'revision' }]),
  };
  f.storage.streamObject.mockResolvedValue({
    stream: Readable.from([JSON.stringify({ files: {} })]),
  });
  expect(await f.service.cleanup()).toBe(1);
  expect(f.storage.deleteObject).toHaveBeenCalledWith('original');
  expect(f.storage.deleteObject).toHaveBeenCalledWith('preview');
});
