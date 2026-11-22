import { assertImageDimensions } from './download-assistant-image';
import { Resvg } from '@resvg/resvg-js';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BillingStorageService } from '../billing/billing-storage.service';
import {
  OBJECT_STORAGE,
  type ObjectStorageService,
} from '../templates/template-storage';
import { LandsService } from './lands.service';
import {
  appendLandImage,
  decodeLandImage,
  imageFile,
} from '../mcp/mcp-land-images';
import { downloadAssistantImage, imageMime } from './download-assistant-image';
export type AssistantImageInput = {
  landId: string;
  expectedRevision: number;
  file?: { download_url: string; file_id: string };
  dataURL?: string;
  sourceElementId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
@Injectable()
export class LandImagesService {
  constructor(
    private readonly lands: LandsService,
    private readonly prisma: PrismaService,
    private readonly billing: BillingStorageService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}
  private async read(userId: string, landId: string) {
    const land = await this.lands.get(userId, landId);
    if (!land.currentRevision)
      return {
        canvas: { elements: [], files: {}, appState: {} } as Record<
          string,
          unknown
        >,
        revision: 0,
      };
    const source = await this.lands.canvas(userId, landId);
    const chunks: Buffer[] = [];
    for await (const chunk of source.object.stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return {
      canvas: JSON.parse(Buffer.concat(chunks).toString()) as Record<
        string,
        unknown
      >,
      revision: source.revision.revision,
    };
  }
  async import(userId: string, input: AssistantImageInput) {
    const saved = await this.read(userId, input.landId);
    if (saved.revision !== input.expectedRevision)
      throw new ConflictException(
        'Land changed. Read the latest land before importing the image.',
      );
    const elements = (saved.canvas.elements ?? []) as Record<string, unknown>[];
    const source = input.sourceElementId
      ? elements.find(
          (e) =>
            e.id === input.sourceElementId &&
            e.type === 'image' &&
            !e.isDeleted,
        )
      : undefined;
    if (input.sourceElementId && !source)
      throw new BadRequestException(
        'Source image is not present in this land.',
      );
    const bytes = input.file
      ? await downloadAssistantImage(input.file.download_url)
      : decodeLandImage(input.dataURL).bytes;
    const mimeType = imageMime(bytes);
    const dimensions = assertImageDimensions(bytes, mimeType);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dataURL = `data:${mimeType};base64,${bytes.toString('base64')}`;
    // Validate real bytes before persisting; large file transfer uses URL rather than JSON.
    decodeLandImage(dataURL, 8_000_000);
    const preview = new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><image width="768" height="768" preserveAspectRatio="xMidYMid meet" href="${dataURL}"/></svg>`,
    )
      .render()
      .asPng();
    const asset = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`land-images:${userId}`},0))`;
        const existing = await tx.landImage.findUnique({
          where: {
            landId_contentHash: { landId: input.landId, contentHash: hash },
          },
        });
        if (existing)
          return tx.landImage.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() },
          });
        await this.billing.assertCanStore(
          userId,
          bytes.length + preview.length,
        );
        const assetId = randomUUID();
        const key = `land-images/${userId}/${input.landId}/${assetId}`;
        try {
          await this.storage.putObject(key, bytes, mimeType);
          await this.storage.putObject(
            `${key}.preview.png`,
            Buffer.from(preview),
            'image/png',
          );
          return await tx.landImage.create({
            data: {
              id: assetId,
              landId: input.landId,
              storageKey: key,
              contentHash: hash,
              mimeType,
              sizeBytes: bytes.length + preview.length,
              previewStorageKey: `${key}.preview.png`,
            },
          });
        } catch (error) {
          await this.storage.deleteObject(key).catch(() => undefined);
          await this.storage
            .deleteObject(`${key}.preview.png`)
            .catch(() => undefined);
          throw error;
        }
      },
      { timeout: 30000, maxWait: 10000 },
    );
    const width =
      input.width ?? (source?.width as number | undefined) ?? dimensions.width;
    const height =
      input.height ??
      (source?.height as number | undefined) ??
      dimensions.height;
    const x =
      input.x ?? (source ? Number(source.x) + Number(source.width) + 40 : 0);
    const y = input.y ?? (source ? Number(source.y) : 0);
    // The helper constructs a valid editor element; only the external asset reference is persisted.
    const added = appendLandImage(
      saved.canvas,
      dataURL,
      { x, y, width, height },
      8_000_000,
    );
    const fileId = added.fileId;
    const canvas = added.canvas as Record<string, unknown>;
    const files = canvas.files as Record<string, unknown>;
    files[fileId] = {
      id: fileId,
      landAssetId: asset.id,
      mimeType,
      created: asset.createdAt.getTime(),
      sizeBytes: asset.sizeBytes,
    };
    const revision = await this.lands.save(
      userId,
      input.landId,
      canvas,
      input.expectedRevision,
    );
    return {
      elementId: added.elementId,
      fileId,
      assetId: asset.id,
      revision: revision.revision,
    };
  }
  async download(userId: string, landId: string, assetId: string) {
    await this.lands.get(userId, landId);
    const asset = await this.prisma.landImage.findFirst({
      where: { id: assetId, landId },
    });
    if (!asset) throw new NotFoundException('Land image not found.');
    return {
      url: await this.storage.createSignedDownloadUrl(asset.storageKey, 300),
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    };
  }
  async visual(userId: string, landId: string, fileId: string) {
    const saved = await this.read(userId, landId);
    const file = (
      (saved.canvas.files ?? {}) as Record<string, Record<string, unknown>>
    )[fileId];
    if (!file?.landAssetId) {
      const image = imageFile(saved.canvas, fileId);
      if (image.bytes.length <= 1_000_000)
        return { ...image, revision: saved.revision };
      assertImageDimensions(image.bytes, image.mimeType);
      const preview = new Resvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><image width="768" height="768" preserveAspectRatio="xMidYMid meet" href="data:${image.mimeType};base64,${image.data}"/></svg>`,
      )
        .render()
        .asPng();
      return {
        mimeType: 'image/png',
        data: Buffer.from(preview).toString('base64'),
        revision: saved.revision,
      };
    }
    const elements = (saved.canvas.elements ?? []) as Record<string, unknown>[];
    if (
      !elements.some(
        (e) => e.type === 'image' && e.fileId === fileId && !e.isDeleted,
      )
    )
      throw new NotFoundException('Image is not visible in this land.');
    const asset = await this.prisma.landImage.findFirst({
      where: { id: file.landAssetId as string, landId },
    });
    if (!asset) throw new NotFoundException('Land image not found.');
    const object = await this.storage.streamObject(
      asset.previewStorageKey ?? asset.storageKey,
    );
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of object.stream) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > 8_000_000)
        throw new BadRequestException('Image exceeds 8 MB.');
      chunks.push(part);
    }
    return {
      mimeType: asset.previewStorageKey ? 'image/png' : asset.mimeType,
      originalDownloadUrl: await this.storage.createSignedDownloadUrl(
        asset.storageKey,
        300,
      ),
      data: Buffer.concat(chunks).toString('base64'),
      revision: saved.revision,
    };
  }
  async cleanup() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const condition = {
      OR: [
        { land: { deletedAt: { not: null } } },
        { updatedAt: { lt: cutoff } },
      ],
    };
    const candidates = await this.prisma.landImage.findMany({
      where: condition,
      include: { land: { select: { ownerId: true, deletedAt: true } } },
      take: 50,
    });
    let removed = 0;
    for (const candidate of candidates) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`land-images:${candidate.land.ownerId}`},0))`;
        const asset = await tx.landImage.findFirst({
          where: { id: candidate.id, ...condition },
        });
        if (!asset) return;
        if (!candidate.land.deletedAt) {
          const revisions = await tx.landRevision.findMany({
            where: { landId: asset.landId },
            select: { storageKey: true },
          });
          for (const revision of revisions) {
            const object = await this.storage.streamObject(revision.storageKey);
            const chunks: Buffer[] = [];
            for await (const chunk of object.stream)
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            const canvas = JSON.parse(Buffer.concat(chunks).toString()) as {
              files?: Record<string, { landAssetId?: string }>;
            };
            if (
              Object.values(canvas.files ?? {}).some(
                (file) => file.landAssetId === asset.id,
              )
            )
              return;
          }
        }
        await this.storage.deleteObject(asset.storageKey);
        if (asset.previewStorageKey)
          await this.storage.deleteObject(asset.previewStorageKey);
        await tx.landImage.delete({ where: { id: asset.id } });
        removed++;
      });
    }
    return removed;
  }
}
