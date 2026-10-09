import { NotFoundException } from '@nestjs/common';
import { AiGalleryService } from './ai-gallery.service';
import { AiGalleryStorageService } from './ai-gallery.storage';
import { PrismaService } from '../prisma/prisma.service';

describe('AiGalleryService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const createSignedDownloadUrl = jest.fn(async (key: string) => `signed://${key}`);

  const prisma = {
    aiRequest: { findMany, findFirst },
  };
  const galleryStorage = { createSignedDownloadUrl };

  let service: AiGalleryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiGalleryService(
      prisma as unknown as PrismaService,
      galleryStorage as unknown as AiGalleryStorageService,
    );
  });

  it('lists only COMPLETED image requests that have storageKey', async () => {
    findMany.mockResolvedValue([
      {
        id: 'req-1',
        provider: 'openai',
        model: 'gpt-image-1',
        variantId: 'v1',
        inputJson: { prompt: 'cat', inputStorageKey: 'ai-gallery/u/req-1/in.png' },
        outputJson: {
          storageKey: 'ai-gallery/u/req-1/out.png',
          contentType: 'image/png',
        },
        createdAt: new Date('2026-10-09T10:00:00.000Z'),
        completedAt: new Date('2026-10-09T10:00:01.000Z'),
      },
      {
        id: 'req-2',
        provider: 'openai',
        model: 'gpt-image-1',
        variantId: null,
        inputJson: { prompt: 'dog' },
        outputJson: { imageUrl: 'https://tmp/x.png' },
        createdAt: new Date('2026-10-09T09:00:00.000Z'),
        completedAt: new Date('2026-10-09T09:00:01.000Z'),
      },
    ]);

    const result = await service.list('user-1', { limit: 24 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      requestId: 'req-1',
      outputUrl: 'signed://ai-gallery/u/req-1/out.png',
      inputUrl: 'signed://ai-gallery/u/req-1/in.png',
      prompt: 'cat',
    });
  });

  it('throws when detail item has no storage key', async () => {
    findFirst.mockResolvedValue({
      id: 'req-x',
      provider: 'openai',
      model: 'm',
      variantId: null,
      inputJson: {},
      outputJson: { imageUrl: 'https://tmp' },
      createdAt: new Date(),
      completedAt: new Date(),
    });
    await expect(service.get('user-1', 'req-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
