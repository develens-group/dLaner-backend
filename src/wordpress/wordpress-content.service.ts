import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WordPressSite } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startSync, syncBatch } from './wordpress-content.schema';
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class WordPressContentService {
  constructor(private readonly prisma: PrismaService) {}
  async start(site: WordPressSite, raw: unknown) {
    const parsed = startSync.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        'Invalid sync manifest. Provide expectedItems and allowlisted siteInfo.',
      );
    if (
      new URL(parsed.data.siteInfo.homeUrl).hostname
        .toLowerCase()
        .replace(/\.$/, '') !== site.domain
    )
      throw new BadRequestException(
        'The package homeUrl does not match the connected site.',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wp-content:${site.id}`}, 0))`;
      const pending = await tx.wordPressContentSnapshot.count({
        where: {
          siteId: site.id,
          status: 'UPLOADING',
          expiresAt: { gt: new Date() },
        },
      });
      if (pending >= 2)
        throw new ConflictException(
          'Two syncs are already pending. Complete them or wait for expiry.',
        );
      return tx.wordPressContentSnapshot.create({
        data: {
          siteId: site.id,
          expectedItems: parsed.data.expectedItems,
          includeUnpublished: parsed.data.includeUnpublished,
          siteInfo: json(parsed.data.siteInfo),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    });
  }

  async batch(site: WordPressSite, snapshotId: string, raw: unknown) {
    const parsed = syncBatch.safeParse(raw);
    if (
      !parsed.success ||
      Buffer.byteLength(JSON.stringify(raw), 'utf8') > 1000000
    )
      throw new BadRequestException(
        'Invalid content batch. Send 1?50 allowlisted items, up to 1 MB.',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${snapshotId}, 0))`;
      const snapshot = await tx.wordPressContentSnapshot.findFirst({
        where: {
          id: snapshotId,
          siteId: site.id,
          status: 'UPLOADING',
          expiresAt: { gt: new Date() },
        },
      });
      if (!snapshot)
        throw new ConflictException(
          'Sync expired, completed, or does not belong to this installation.',
        );
      for (const item of parsed.data.items) {
        if (!snapshot.includeUnpublished && item.status !== 'publish')
          throw new BadRequestException(
            'This snapshot accepts published content only.',
          );
        const payload = json(item.data);
        const sizeBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
        await tx.wordPressContentItem.upsert({
          where: {
            snapshotId_kind_externalId: {
              snapshotId,
              kind: item.kind,
              externalId: item.externalId,
            },
          },
          create: {
            snapshotId,
            kind: item.kind,
            externalId: item.externalId,
            status: item.status,
            title: item.data.title,
            payload,
            sizeBytes,
          },
          update: {
            status: item.status,
            title: item.data.title,
            payload,
            sizeBytes,
          },
        });
      }
      const aggregate = await tx.wordPressContentItem.aggregate({
        where: { snapshotId },
        _count: true,
        _sum: { sizeBytes: true },
      });
      if (
        aggregate._count > snapshot.expectedItems ||
        (aggregate._sum.sizeBytes ?? 0) > 25000000
      )
        throw new BadRequestException(
          'Snapshot exceeds the declared count or 25 MB storage limit.',
        );
      return {
        snapshotId,
        receivedItems: aggregate._count,
        expectedItems: snapshot.expectedItems,
      };
    });
  }
  async complete(site: WordPressSite, snapshotId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${snapshotId}, 0))`;
      // Serializes competing snapshots for this installation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wp-content:${site.id}`}, 0))`;
      const currentSite = await tx.wordPressSite.findFirst({
        where: { id: site.id, enabled: true },
      });
      if (!currentSite) throw new NotFoundException('Site is disconnected.');
      const snapshot = await tx.wordPressContentSnapshot.findFirst({
        where: { id: snapshotId, siteId: site.id },
      });
      if (!snapshot) throw new NotFoundException('Snapshot not found.');
      if (
        snapshot.status === 'READY' &&
        currentSite.contentSnapshotId === snapshot.id
      )
        return snapshot;
      if (snapshot.status !== 'UPLOADING' || snapshot.expiresAt <= new Date())
        throw new ConflictException('Snapshot is not open for completion.');
      const count = await tx.wordPressContentItem.count({
        where: { snapshotId },
      });
      if (count !== snapshot.expectedItems)
        throw new ConflictException(
          'Upload all declared records before completing the sync.',
        );
      if (currentSite.contentSnapshotId) {
        const active = await tx.wordPressContentSnapshot.findUnique({
          where: { id: currentSite.contentSnapshotId },
        });
        if (
          active &&
          (active.createdAt > snapshot.createdAt ||
            (active.createdAt.getTime() === snapshot.createdAt.getTime() &&
              active.id > snapshot.id))
        )
          throw new ConflictException(
            'A newer snapshot has already been activated.',
          );
      }
      const completed = await tx.wordPressContentSnapshot.update({
        where: { id: snapshotId },
        data: { status: 'READY', completedAt: new Date() },
      });
      await tx.wordPressSite.update({
        where: { id: site.id },
        data: { contentSnapshotId: snapshotId },
      });
      return completed;
    });
    // Retain two complete snapshots. Partial syncs never replace active content.
    const obsolete = await this.prisma.wordPressContentSnapshot.findMany({
      where: { siteId: site.id, status: 'READY', id: { not: snapshotId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 1,
      select: { id: true },
    });
    await this.prisma.wordPressContentSnapshot.deleteMany({
      where: { siteId: site.id, id: { in: obsolete.map((row) => row.id) } },
    });
    return {
      snapshotId: result.id,
      status: result.status,
      completedAt: result.completedAt,
    };
  }
  async startForWeb(userId: string, siteId: string, payload: unknown) {
    return this.start(await this.owned(userId, siteId), payload);
  }
  async batchForWeb(
    userId: string,
    siteId: string,
    snapshotId: string,
    payload: unknown,
  ) {
    return this.batch(await this.owned(userId, siteId), snapshotId, payload);
  }
  async completeForWeb(userId: string, siteId: string, snapshotId: string) {
    return this.complete(await this.owned(userId, siteId), snapshotId);
  }
  async abort(site: WordPressSite, snapshotId: string) {
    const result = await this.prisma.wordPressContentSnapshot.deleteMany({
      where: { id: snapshotId, siteId: site.id, status: 'UPLOADING' },
    });
    return { aborted: result.count > 0 };
  }
  async abortForWeb(userId: string, siteId: string, snapshotId: string) {
    return this.abort(await this.owned(userId, siteId), snapshotId);
  }
  private async owned(userId: string, siteId: string) {
    const site = await this.prisma.wordPressSite.findFirst({
      where: { id: siteId, userId, enabled: true },
    });
    if (!site)
      throw new NotFoundException('Connected WordPress site not found.');
    return site;
  }
  async summary(userId: string, siteId: string) {
    const site = await this.owned(userId, siteId);
    const active = site.contentSnapshotId
      ? await this.prisma.wordPressContentSnapshot.findFirst({
          where: { id: site.contentSnapshotId, siteId, status: 'READY' },
          select: {
            id: true,
            siteInfo: true,
            expectedItems: true,
            completedAt: true,
            includeUnpublished: true,
          },
        })
      : null;
    return { siteId, domain: site.domain, active };
  }
  async list(
    userId: string,
    siteId: string,
    query: { page?: number; kind?: string; search?: string },
  ) {
    const { active } = await this.summary(userId, siteId);
    if (!active)
      return { snapshotId: null, items: [], page: 1, total: 0, pages: 0 };
    const page = query.page ?? 1;
    const where = {
      snapshotId: active.id,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.wordPressContentItem.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { externalId: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
        select: {
          id: true,
          externalId: true,
          kind: true,
          title: true,
          status: true,
        },
      }),
      this.prisma.wordPressContentItem.count({ where }),
    ]);
    return {
      snapshotId: active.id,
      syncedAt: active.completedAt,
      items,
      page,
      total,
      pages: Math.ceil(total / 20),
    };
  }
  async item(userId: string, siteId: string, itemId: string) {
    const site = await this.owned(userId, siteId);
    const item = await this.prisma.wordPressContentItem.findFirst({
      where: {
        id: itemId,
        snapshotId:
          site.contentSnapshotId ?? '00000000-0000-0000-0000-000000000000',
        snapshot: { siteId, status: 'READY' },
      },
    });
    if (!item)
      throw new NotFoundException(
        'Content item is unavailable; refresh the site content list.',
      );
    return item;
  }
  async cleanup() {
    return this.prisma.wordPressContentSnapshot.deleteMany({
      where: { status: 'UPLOADING', expiresAt: { lt: new Date() } },
    });
  }
}
