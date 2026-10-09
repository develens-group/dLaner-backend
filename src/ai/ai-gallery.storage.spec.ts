import {
  AiGalleryStorageService,
  extensionForContentType,
  resolveImageBytes,
} from './ai-gallery.storage';

describe('ai-gallery.storage helpers', () => {
  it('maps content types to extensions', () => {
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/jpeg; charset=binary')).toBe('jpg');
    expect(extensionForContentType('application/octet-stream')).toBe('bin');
  });

  it('decodes data URLs', async () => {
    const png = Buffer.from([1, 2, 3]).toString('base64');
    const result = await resolveImageBytes(`data:image/png;base64,${png}`);
    expect(result).toEqual({
      contentType: 'image/png',
      buffer: Buffer.from([1, 2, 3]),
    });
  });

  it('downloads http(s) image URLs', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/webp' },
      arrayBuffer: async () => Uint8Array.from([9, 8, 7]).buffer,
    } as unknown as Response);

    const result = await resolveImageBytes('https://cdn.example/out.webp');
    expect(result).toEqual({
      contentType: 'image/webp',
      buffer: Buffer.from([9, 8, 7]),
    });
    jest.restoreAllMocks();
  });
});

describe('AiGalleryStorageService.persistCompletedAssets', () => {
  const putObject = jest.fn();
  const createSignedDownloadUrl = jest.fn(async (key: string) => `signed://${key}`);
  const storage = { putObject, createSignedDownloadUrl };

  beforeEach(() => {
    jest.clearAllMocks();
    putObject.mockResolvedValue(undefined);
  });

  it('stores input and output under ai-gallery prefix', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => Uint8Array.from([4, 5]).buffer,
    } as unknown as Response);

    const service = new AiGalleryStorageService(storage as never);
    const result = await service.persistCompletedAssets({
      userId: 'user-1',
      requestId: 'req-1',
      input: {
        prompt: 'cat',
        image: {
          buffer: Buffer.from([1, 2]),
          mimetype: 'image/jpeg',
        } as Express.Multer.File,
      },
      outputImageUrl: 'https://cdn.example/out.png',
    });

    expect(putObject).toHaveBeenCalledTimes(2);
    expect(putObject).toHaveBeenCalledWith(
      'ai-gallery/user-1/req-1/in.jpg',
      Buffer.from([1, 2]),
      'image/jpeg',
    );
    expect(putObject).toHaveBeenCalledWith(
      'ai-gallery/user-1/req-1/out.png',
      Buffer.from([4, 5]),
      'image/png',
    );
    expect(result.input?.storageKey).toBe('ai-gallery/user-1/req-1/in.jpg');
    expect(result.output?.signedUrl).toBe(
      'signed://ai-gallery/user-1/req-1/out.png',
    );
    jest.restoreAllMocks();
  });

  it('stores only output when input image is missing', async () => {
    const png = Buffer.from([9]).toString('base64');
    const service = new AiGalleryStorageService(storage as never);
    const result = await service.persistCompletedAssets({
      userId: 'user-1',
      requestId: 'req-2',
      input: { prompt: 'no image' },
      outputImageUrl: `data:image/png;base64,${png}`,
    });

    expect(putObject).toHaveBeenCalledTimes(1);
    expect(putObject).toHaveBeenCalledWith(
      'ai-gallery/user-1/req-2/out.png',
      Buffer.from([9]),
      'image/png',
    );
    expect(result.input).toBeUndefined();
    expect(result.output?.storageKey).toBe('ai-gallery/user-1/req-2/out.png');
  });

  it('swallows putObject failures and returns partial result', async () => {
    putObject.mockRejectedValue(new Error('R2 down'));
    const service = new AiGalleryStorageService(storage as never);
    const result = await service.persistCompletedAssets({
      userId: 'user-1',
      requestId: 'req-3',
      input: {
        image: {
          buffer: Buffer.from([1]),
          mimetype: 'image/png',
        } as Express.Multer.File,
      },
      outputImageUrl: `data:image/png;base64,${Buffer.from([2]).toString('base64')}`,
    });
    expect(result).toEqual({});
  });
});
