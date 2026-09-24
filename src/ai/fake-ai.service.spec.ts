import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FAKE_AI_TYPES,
  buildLoremFlickrUrl,
  getFakeAiType,
  listFakeAiTypes,
} from './fake-ai.catalog';
import { FakeAiService } from './fake-ai.service';

describe('fake-ai.catalog', () => {
  it('exposes all eight types with credit costs', () => {
    expect(listFakeAiTypes()).toHaveLength(8);
    expect(getFakeAiType('remove-background')?.creditCost).toBe(2);
    expect(getFakeAiType('remove-object')?.creditCost).toBe(3);
    expect(getFakeAiType('sketch-image')?.creditCost).toBe(2);
    expect(getFakeAiType('generate-image')?.creditCost).toBe(4);
    expect(getFakeAiType('image-to-image')?.creditCost).toBe(4);
    expect(getFakeAiType('upscale-image')?.creditCost).toBe(3);
    expect(getFakeAiType('enhance-image')?.creditCost).toBe(2);
    expect(getFakeAiType('replace-background')?.creditCost).toBe(3);
  });

  it('requires image for remove-background and prompt for remove-object', () => {
    const bg = getFakeAiType('remove-background')!;
    expect(bg.fields.find((f) => f.name === 'image')?.required).toBe(true);
    const obj = getFakeAiType('remove-object')!;
    expect(obj.fields.find((f) => f.name === 'prompt')?.required).toBe(true);
    expect(obj.fields.find((f) => f.name === 'image')?.required).toBe(true);
  });

  it('builds loremflickr urls', () => {
    expect(buildLoremFlickrUrl(512, 512, 42)).toBe(
      'https://loremflickr.com/512/512?lock=42',
    );
  });

  it('returns undefined for unknown type', () => {
    expect(getFakeAiType('nope')).toBeUndefined();
    expect(FAKE_AI_TYPES.length).toBe(8);
  });
});

describe('FakeAiService', () => {
  const credits = {
    reserveCredits: jest.fn(),
    captureReservation: jest.fn(),
    releaseReservation: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'AI_CREDIT_CHARGING_ENABLED') return 'true';
      return fallback;
    }),
  };

  const pngFile = {
    fieldname: 'image',
    originalname: 'a.png',
    mimetype: 'image/png',
    size: 100,
    buffer: Buffer.from([1, 2, 3]),
  } as Express.Multer.File;

  let service: FakeAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'AI_CREDIT_CHARGING_ENABLED') return 'true';
      return fallback;
    });
    credits.reserveCredits.mockResolvedValue({ id: 'res-1', amount: 2 });
    credits.captureReservation.mockResolvedValue({});
    credits.releaseReservation.mockResolvedValue({});
    service = new FakeAiService(
      credits as never,
      config as unknown as ConfigService,
    );
  });

  it('lists types for GET', () => {
    expect(service.listTypes()).toHaveLength(8);
    expect(service.listTypes()[0]).toHaveProperty('creditCost');
    expect(service.listTypes()[0]).toHaveProperty('fields');
    expect(service.listTypes()[0]).toHaveProperty('example');
  });

  it('rejects unknown type without reserving', async () => {
    await expect(
      service.execute('user-1', { type: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('rejects remove-background without image', async () => {
    await expect(
      service.execute('user-1', { type: 'remove-background' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('rejects remove-object without prompt', async () => {
    await expect(
      service.execute('user-1', {
        type: 'remove-object',
        image: pngFile,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('rejects invalid mime', async () => {
    await expect(
      service.execute('user-1', {
        type: 'enhance-image',
        image: { ...pngFile, mimetype: 'application/pdf' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('reserves, captures, and returns loremflickr url', async () => {
    const result = await service.execute('user-1', {
      type: 'remove-background',
      image: pngFile,
    });
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      'user-1',
      2000,
      expect.stringMatching(/^fake-ai:/),
      'FAKE_AI_REQUEST',
      expect.any(String),
    );
    expect(credits.captureReservation).toHaveBeenCalledWith(
      'user-1',
      'res-1',
      2000,
      expect.stringMatching(/:capture$/),
    );
    expect(result.type).toBe('remove-background');
    expect(result.creditCost).toBe(2);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.imageUrl).toMatch(
      /^https:\/\/loremflickr\.com\/512\/512\?lock=\d+$/,
    );
  });

  it('uses generate-image width/height when provided', async () => {
    credits.reserveCredits.mockResolvedValue({ id: 'res-2', amount: 4 });
    const result = await service.execute('user-1', {
      type: 'generate-image',
      prompt: 'cat',
      width: '640',
      height: '480',
    });
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.imageUrl).toContain('/640/480?lock=');
  });

  it('skips credits when charging disabled', async () => {
    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'AI_CREDIT_CHARGING_ENABLED') return 'false';
      return fallback;
    });
    service = new FakeAiService(
      credits as never,
      config as unknown as ConfigService,
    );
    const result = await service.execute('user-1', {
      type: 'generate-image',
      prompt: 'dog',
    });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(result.creditCost).toBe(4);
    expect(result.imageUrl).toContain('loremflickr.com');
  });

  it('releases reservation when capture fails', async () => {
    credits.captureReservation.mockRejectedValue(new Error('capture boom'));
    await expect(
      service.execute('user-1', {
        type: 'remove-background',
        image: pngFile,
      }),
    ).rejects.toThrow('capture boom');
    expect(credits.releaseReservation).toHaveBeenCalledWith(
      'user-1',
      'res-1',
      expect.stringMatching(/:release$/),
    );
  });

  it('rejects invalid scale for upscale-image', async () => {
    await expect(
      service.execute('user-1', {
        type: 'upscale-image',
        image: pngFile,
        scale: '3',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects strength out of range', async () => {
    await expect(
      service.execute('user-1', {
        type: 'image-to-image',
        image: pngFile,
        prompt: 'x',
        strength: '1.5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
