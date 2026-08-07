import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  OBJECT_STORAGE,
  type ObjectStorageService,
} from '../templates/template-storage';
import type { CreateLandDto, ListLandsDto, UpdateLandDto } from './lands.dto';

@Injectable()
export class LandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async create(userId: string, dto: CreateLandDto) {
    const land = await this.prisma.land.create({
      data: { ownerId: userId, title: dto.title.trim() },
    });
    if (dto.canvas) await this.save(userId, land.id, dto.canvas);
    return this.get(userId, land.id);
  }

  async list(userId: string, query: ListLandsDto) {
    const where = { ownerId: userId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.land.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          currentRevision: true,
          _count: { select: { revisions: true } },
        },
      }),
      this.prisma.land.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(userId: string, id: string) {
    const land = await this.prisma.land.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
      include: {
        currentRevision: true,
        _count: { select: { revisions: true } },
      },
    });
    if (!land) throw new NotFoundException('Land not found');
    return land;
  }

  async update(userId: string, id: string, dto: UpdateLandDto) {
    await this.get(userId, id);
    return this.prisma.land.update({
      where: { id },
      data: { title: dto.title.trim() },
    });
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.land.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  async save(userId: string, landId: string, canvas: unknown) {
    await this.get(userId, landId);
    this.assertSafeJson(canvas);
    const body = Buffer.from(JSON.stringify(canvas), 'utf8');
    const maxBytes = this.config.get<number>('LAND_MAX_JSON_BYTES', 10_000_000);
    if (body.length > maxBytes)
      throw new BadRequestException(`Canvas exceeds ${maxBytes} bytes`);
    const hash = createHash('sha256').update(body).digest('hex');
    const objectId = randomUUID();
    const key = `lands/${userId}/${landId}/${objectId}.json`;
    await this.storage.putObject(key, body, 'application/json; charset=utf-8');

    let obsoleteKeys: string[] = [];
    try {
      const revision = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${landId}, 0))`;
        const land = await tx.land.findFirst({
          where: { id: landId, ownerId: userId, deletedAt: null },
        });
        if (!land) throw new NotFoundException('Land not found');
        const aggregate = await tx.landRevision.aggregate({
          where: { landId },
          _max: { revision: true },
        });
        const created = await tx.landRevision.create({
          data: {
            landId,
            revision: (aggregate._max.revision ?? 0) + 1,
            storageKey: key,
            contentHash: hash,
            sizeBytes: body.length,
            createdById: userId,
          },
        });
        await tx.land.update({
          where: { id: landId },
          data: { currentRevisionId: created.id },
        });
        const keep = this.config.get<number>('LAND_REVISION_RETENTION', 3);
        const obsolete = await tx.landRevision.findMany({
          where: { landId },
          orderBy: { revision: 'desc' },
          skip: keep,
          select: { id: true, storageKey: true },
        });
        if (obsolete.length) {
          await tx.landRevision.deleteMany({
            where: { id: { in: obsolete.map((item) => item.id) } },
          });
          obsoleteKeys = obsolete.map((item) => item.storageKey);
        }
        return created;
      });
      await Promise.allSettled(
        obsoleteKeys.map((oldKey) => this.storage.deleteObject(oldKey)),
      );
      return revision;
    } catch (error) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw error;
    }
  }

  async revisions(userId: string, landId: string) {
    await this.get(userId, landId);
    return this.prisma.landRevision.findMany({
      where: { landId },
      orderBy: { revision: 'desc' },
    });
  }

  async canvas(userId: string, landId: string, revisionNumber?: number) {
    const land = await this.get(userId, landId);
    const revision =
      revisionNumber === undefined
        ? land.currentRevision
        : await this.prisma.landRevision.findUnique({
            where: {
              landId_revision: {
                landId,
                revision: this.parseRevision(revisionNumber),
              },
            },
          });
    if (!revision) throw new NotFoundException('Land revision not found');
    return {
      revision,
      object: await this.storage.streamObject(revision.storageKey),
    };
  }

  async restore(userId: string, landId: string, revisionNumber: number) {
    const source = await this.canvas(
      userId,
      landId,
      this.parseRevision(revisionNumber),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of source.object.stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const canvas: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return this.save(userId, landId, canvas);
  }

  private parseRevision(value: number) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new BadRequestException('Invalid revision');
    return value;
  }

  private assertSafeJson(value: unknown, seen = new Set<object>()): void {
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object')
      throw new BadRequestException('Canvas must contain valid JSON values');
    if (seen.has(value))
      throw new BadRequestException(
        'Canvas must not contain circular references',
      );
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor')
        throw new BadRequestException('Unsafe canvas key');
      this.assertSafeJson(child, seen);
    }
    seen.delete(value);
  }
}
