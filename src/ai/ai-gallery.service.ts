import { Injectable, NotFoundException } from '@nestjs/common';
import { AiOperation, AiRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiGalleryStorageService } from './ai-gallery.storage';

export type AiGalleryItem = {
  requestId: string;
  provider: string;
  model: string;
  variantId: string | null;
  prompt: string | null;
  createdAt: Date;
  completedAt: Date | null;
  outputUrl: string;
  outputContentType: string | null;
  inputUrl: string | null;
  inputContentType: string | null;
};

@Injectable()
export class AiGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly galleryStorage: AiGalleryStorageService,
  ) {}

  async list(userId: string, options?: { cursor?: string; limit?: number }) {
    const limit = Math.min(Math.max(options?.limit ?? 24, 1), 50);
    const rows = await this.prisma.aiRequest.findMany({
      where: {
        userId,
        operation: AiOperation.IMAGE_GENERATION,
        status: AiRequestStatus.COMPLETED,
        ...(options?.cursor
          ? { createdAt: { lt: new Date(options.cursor) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
      select: {
        id: true,
        provider: true,
        model: true,
        variantId: true,
        inputJson: true,
        outputJson: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const items: AiGalleryItem[] = [];
    for (const row of rows) {
      const mapped = await this.mapRow(row);
      if (mapped) items.push(mapped);
      if (items.length >= limit) break;
    }

    const nextCursor =
      items.length === limit
        ? items[items.length - 1]?.createdAt.toISOString() ?? null
        : null;

    return { items, nextCursor };
  }

  async get(userId: string, requestId: string) {
    const row = await this.prisma.aiRequest.findFirst({
      where: {
        id: requestId,
        userId,
        operation: AiOperation.IMAGE_GENERATION,
        status: AiRequestStatus.COMPLETED,
      },
      select: {
        id: true,
        provider: true,
        model: true,
        variantId: true,
        inputJson: true,
        outputJson: true,
        createdAt: true,
        completedAt: true,
      },
    });
    if (!row) throw new NotFoundException('Gallery item not found');
    const mapped = await this.mapRow(row);
    if (!mapped) throw new NotFoundException('Gallery item not found');
    return mapped;
  }

  private async mapRow(row: {
    id: string;
    provider: string;
    model: string;
    variantId: string | null;
    inputJson: Prisma.JsonValue;
    outputJson: Prisma.JsonValue;
    createdAt: Date;
    completedAt: Date | null;
  }): Promise<AiGalleryItem | null> {
    const output =
      row.outputJson && typeof row.outputJson === 'object'
        ? (row.outputJson as Record<string, unknown>)
        : null;
    const storageKey =
      typeof output?.storageKey === 'string' ? output.storageKey : null;
    if (!storageKey || !storageKey.startsWith(`ai-gallery/`)) return null;

    const input =
      row.inputJson && typeof row.inputJson === 'object'
        ? (row.inputJson as Record<string, unknown>)
        : null;
    const inputStorageKey =
      typeof input?.inputStorageKey === 'string' ? input.inputStorageKey : null;

    const outputUrl =
      await this.galleryStorage.createSignedDownloadUrl(storageKey);
    const inputUrl = inputStorageKey
      ? await this.galleryStorage.createSignedDownloadUrl(inputStorageKey)
      : null;

    return {
      requestId: row.id,
      provider: row.provider,
      model: row.model,
      variantId: row.variantId,
      prompt: typeof input?.prompt === 'string' ? input.prompt : null,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      outputUrl,
      outputContentType:
        typeof output?.contentType === 'string' ? output.contentType : null,
      inputUrl,
      inputContentType:
        typeof input?.inputContentType === 'string'
          ? input.inputContentType
          : null,
    };
  }
}
