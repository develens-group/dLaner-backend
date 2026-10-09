import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OBJECT_STORAGE,
  type ObjectStorageService,
} from '../templates/template-storage';
import type { ImageExecuteInput } from './providers/image-provider.registry';

export type GalleryPersistedAsset = {
  storageKey: string;
  contentType: string;
  signedUrl: string;
};

export type GalleryPersistResult = {
  input?: GalleryPersistedAsset;
  output?: GalleryPersistedAsset;
};

@Injectable()
export class AiGalleryStorageService {
  private readonly logger = new Logger(AiGalleryStorageService.name);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async persistCompletedAssets(params: {
    userId: string;
    requestId: string;
    input: ImageExecuteInput;
    outputImageUrl: string;
  }): Promise<GalleryPersistResult> {
    const result: GalleryPersistResult = {};
    try {
      if (params.input.image?.buffer?.length) {
        const contentType =
          params.input.image.mimetype?.trim() || 'application/octet-stream';
        const ext = extensionForContentType(contentType);
        const storageKey = `ai-gallery/${params.userId}/${params.requestId}/in.${ext}`;
        await this.storage.putObject(
          storageKey,
          params.input.image.buffer,
          contentType,
        );
        result.input = {
          storageKey,
          contentType,
          signedUrl: await this.storage.createSignedDownloadUrl(storageKey),
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to persist AI gallery input for ${params.requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      const decoded = await resolveImageBytes(params.outputImageUrl);
      if (decoded) {
        const ext = extensionForContentType(decoded.contentType);
        const storageKey = `ai-gallery/${params.userId}/${params.requestId}/out.${ext}`;
        await this.storage.putObject(
          storageKey,
          decoded.buffer,
          decoded.contentType,
        );
        result.output = {
          storageKey,
          contentType: decoded.contentType,
          signedUrl: await this.storage.createSignedDownloadUrl(storageKey),
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to persist AI gallery output for ${params.requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return result;
  }

  createSignedDownloadUrl(key: string, expiresIn?: number) {
    return this.storage.createSignedDownloadUrl(key, expiresIn);
  }
}

export function extensionForContentType(contentType: string) {
  const normalized = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  switch (normalized) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/png':
      return 'png';
    default:
      return 'bin';
  }
}

export async function resolveImageBytes(
  imageUrl: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(trimmed);
    if (!match) return null;
    return {
      contentType: match[1] || 'application/octet-stream',
      buffer: Buffer.from(match[2], 'base64'),
    };
  }

  if (!/^https?:\/\//i.test(trimmed)) return null;

  const response = await fetch(trimmed);
  if (!response.ok) {
    throw new Error(`Output image download failed (${response.status})`);
  }
  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return null;
  return { buffer, contentType };
}
