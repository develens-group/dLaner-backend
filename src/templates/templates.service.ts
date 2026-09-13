/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  TemplateReviewStatus,
  TemplateMetricType,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE } from './template-storage';
import type { ObjectStorageService } from './template-storage';
import { Inject } from '@nestjs/common';
import {
  CreateTemplateDto,
  CreateTemplateCategoryDto,
  CreateVersionDto,
  AdminTemplateQueryDto,
  ListTemplatesDto,
  ShareDto,
  UpdateTemplateDto,
  UpdateTemplateCategoryDto,
} from './templates.dto';

const sha256 = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');
const problem = (code: string, message: string) =>
  new BadRequestException({ code, message });

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async create(ownerId: string, dto: CreateTemplateDto) {
    const base =
      dto.slug ??
      (dto.title
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') ||
        `template-${randomBytes(4).toString('hex')}`);
    for (let n = 0; n < 5; n++)
      try {
        const created = await this.prisma.template.create({
          data: {
            ownerId,
            title: dto.title.trim(),
            slug: n ? `${base}-${randomBytes(3).toString('hex')}` : base,
            description: dto.description?.trim(),
            visibility: dto.visibility,
            categoryId: dto.categoryId ?? undefined,
            tags: dto.tags?.map((x) => x.trim().toLowerCase()),
          },
          include: {
            currentVersion: { include: { items: true } },
            category: true,
          },
        });
        return this.enrichTemplate(created);
      } catch (e) {
        if (!(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ))
          throw e;
      }
    throw new ConflictException({
      code: 'TEMPLATE_SLUG_CONFLICT',
      message: 'Could not allocate a unique slug',
    });
  }
  async owned(ownerId: string, id: string) {
    const item = await this.prisma.template.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: { currentVersion: { include: { items: true } }, category: true },
    });
    if (!item)
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found',
      });
    return this.enrichTemplate(item);
  }
  async mine(ownerId: string, q: ListTemplatesDto) {
    return this.page({ ownerId, deletedAt: null }, q, true);
  }
  async update(ownerId: string, id: string, dto: UpdateTemplateDto) {
    await this.owned(ownerId, id);
    return this.enrichTemplate(
      await this.prisma.template.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          slug: dto.slug,
          description: dto.description?.trim(),
          visibility: dto.visibility,
          ...(dto.categoryId !== undefined
            ? { categoryId: dto.categoryId }
            : {}),
          tags: dto.tags?.map((x) => x.trim().toLowerCase()),
        },
        include: {
          currentVersion: { include: { items: true } },
          category: true,
        },
      }),
    );
  }
  async remove(ownerId: string, id: string) {
    await this.requireOwned(ownerId, id);
    return this.prisma.template.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
  async lifecycle(ownerId: string, id: string, archived: boolean) {
    await this.requireOwned(ownerId, id);
    return this.enrichTemplate(
      await this.prisma.template.update({
        where: { id },
        data: { lifecycleStatus: archived ? 'ARCHIVED' : 'ACTIVE' },
        include: {
          currentVersion: { include: { items: true } },
          category: true,
        },
      }),
    );
  }

  async createVersion(
    ownerId: string,
    id: string,
    dto: CreateVersionDto,
    previewImage?: Express.Multer.File,
  ) {
    const template = await this.requireOwned(ownerId, id);
    if (template.reviewStatus === 'PENDING')
      throw new ConflictException({
        code: 'TEMPLATE_ALREADY_PENDING',
        message: 'Template is pending review',
      });
    const raw = JSON.stringify(dto.library);
    const max = this.config.get<number>('TEMPLATE_MAX_BUNDLE_BYTES', 5_000_000);
    if (Buffer.byteLength(raw) > max)
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'Library is too large');
    this.validateLibrary(dto.library);
    const versionId = randomUUID();
    const manifestKey = `templates/${id}/versions/${versionId}/manifest.json`;
    const body = Buffer.from(raw, 'utf8');
    await this.storage.putObject(manifestKey, body, 'application/json');
    let previewKey: string | undefined;
    try {
      const preview = this.resolvePreviewInput(previewImage, dto);
      if (preview)
        previewKey = await this.storePreviewBuffer(
          id,
          versionId,
          preview.buffer,
          preview.mime,
        );
      const version = await this.prisma.$transaction(
        async (tx) => {
          const latest = await tx.templateVersion.findFirst({
            where: { templateId: id },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          const versionNumber = (latest?.versionNumber ?? 0) + 1;
          const created = await tx.templateVersion.create({
            data: {
              id: versionId,
              templateId: id,
              versionNumber,
              changelog: dto.changelog,
              libraryType: dto.library.type,
              librarySchemaVersion: dto.library.version,
              source: dto.library.source,
              itemCount: dto.library.libraryItems.length,
              manifestStorageKey: manifestKey,
              previewStorageKey: previewKey,
              contentHash: sha256(body),
              createdById: ownerId,
              items: {
                create: dto.library.libraryItems.map((x, index) => ({
                  externalId: x.id,
                  name: x.name.trim(),
                  description: x.description,
                  category: x.category,
                  form: x.form,
                  sortOrder: index,
                  elementsJson: x.elements as Prisma.InputJsonValue,
                  contentHash: sha256(JSON.stringify(x.elements)),
                })),
              },
            },
            include: { items: true },
          });
          await tx.template.update({
            where: { id },
            data: {
              reviewStatus: 'DRAFT',
              rejectionReason: null,
              currentVersionId: created.id,
            },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.enrichVersion(version);
    } catch (e) {
      await this.storage.deleteObject(manifestKey).catch(() => undefined);
      if (previewKey)
        await this.storage.deleteObject(previewKey).catch(() => undefined);
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException({
          code: 'TEMPLATE_VERSION_CONFLICT',
          message: 'Concurrent version creation',
        });
      throw e;
    }
  }

  private resolvePreviewInput(
    file: Express.Multer.File | undefined,
    dto: CreateVersionDto,
  ): { buffer: Buffer; mime: string } | undefined {
    if (file?.buffer?.length) {
      return {
        buffer: file.buffer,
        mime: (file.mimetype || dto.previewImageType || '').toLowerCase(),
      };
    }
    const raw = dto.previewImageBase64?.trim();
    if (!raw) return undefined;
    const dataUrl = /^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/i.exec(raw);
    const mimeFromDataUrl = dataUrl?.[1]?.toLowerCase();
    const base64 = (dataUrl?.[2] ?? raw).replace(/\s/g, '');
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'Invalid previewImageBase64');
    }
    if (!buffer.length)
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'previewImage is empty');
    const maxBytes = 5 * 1024 * 1024;
    if (buffer.length > maxBytes)
      throw problem(
        'TEMPLATE_INVALID_PAYLOAD',
        'previewImage exceeds 5MB limit',
      );
    const mime = (
      dto.previewImageType ||
      mimeFromDataUrl ||
      ''
    ).toLowerCase();
    if (!mime)
      throw problem(
        'TEMPLATE_INVALID_PAYLOAD',
        'previewImageType is required with previewImageBase64',
      );
    return { buffer, mime };
  }

  private async storePreviewBuffer(
    templateId: string,
    versionId: string,
    buffer: Buffer,
    mimeInput: string,
  ) {
    const mime = mimeInput.toLowerCase();
    const allowed = new Map([
      ['image/jpeg', 'jpg'],
      ['image/jpg', 'jpg'],
      ['image/png', 'png'],
    ]);
    const ext = allowed.get(mime);
    if (!ext)
      throw problem(
        'TEMPLATE_INVALID_PAYLOAD',
        'previewImage must be image/jpeg or image/png',
      );
    if (!buffer.length)
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'previewImage is empty');
    const maxBytes = 5 * 1024 * 1024;
    if (buffer.length > maxBytes)
      throw problem(
        'TEMPLATE_INVALID_PAYLOAD',
        'previewImage exceeds 5MB limit',
      );
    const key = `templates/${templateId}/versions/${versionId}/preview.${ext}`;
    await this.storage.putObject(
      key,
      buffer,
      mime === 'image/jpg' ? 'image/jpeg' : mime,
    );
    return key;
  }

  private async requireOwned(ownerId: string, id: string) {
    const item = await this.prisma.template.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!item)
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found',
      });
    return item;
  }
  private validateLibrary(lib: CreateVersionDto['library']) {
    const maxItems = this.config.get<number>('TEMPLATE_MAX_ITEMS', 100);
    const maxElements = this.config.get<number>(
      'TEMPLATE_MAX_ELEMENTS_PER_ITEM',
      2000,
    );
    if (lib.libraryItems.length > maxItems)
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'Too many items');
    const ids = new Set<string>();
    for (const item of lib.libraryItems) {
      if (!item.name?.trim())
        throw problem('TEMPLATE_INVALID_PAYLOAD', 'Item name is required');
      if (ids.has(item.id))
        throw problem('TEMPLATE_INVALID_PAYLOAD', 'Duplicate item id');
      ids.add(item.id);
      if (!Array.isArray(item.elements) || item.elements.length > maxElements)
        throw problem('TEMPLATE_INVALID_PAYLOAD', 'Invalid element count');
      this.safeTree(item.elements, 0);
    }
  }
  private safeTree(value: unknown, depth: number) {
    if (depth > 30)
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'JSON is too deep');
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw problem('TEMPLATE_INVALID_PAYLOAD', 'Unsafe object key');
        this.safeTree(child, depth + 1);
      }
    }
  }
  async versions(ownerId: string, id: string) {
    await this.requireOwned(ownerId, id);
    const rows = await this.prisma.templateVersion.findMany({
      where: { templateId: id },
      orderBy: { versionNumber: 'desc' },
      include: { items: true },
    });
    return rows.map((row) => this.enrichVersion(row));
  }
  async version(ownerId: string, id: string, versionId: string) {
    await this.requireOwned(ownerId, id);
    const v = await this.prisma.templateVersion.findFirst({
      where: { id: versionId, templateId: id },
      include: { items: true },
    });
    if (!v) throw new NotFoundException();
    return this.enrichVersion(v);
  }
  async submit(ownerId: string, id: string) {
    await this.requireOwned(ownerId, id);
    const latest = await this.prisma.templateVersion.findFirst({
      where: { templateId: id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latest)
      throw new ConflictException({
        code: 'TEMPLATE_NOT_READY',
        message: 'A version is required',
      });
    return this.prisma.$transaction(async (tx) => {
      const out = await tx.template.update({
        where: { id },
        data: { reviewStatus: 'PENDING', submittedAt: new Date() },
        include: {
          currentVersion: { include: { items: true } },
          category: true,
        },
      });
      await tx.templateReview.create({
        data: { templateId: id, action: 'SUBMITTED' },
      });
      return this.enrichTemplate(out);
    });
  }
  async review(
    actorId: string,
    role: UserRole,
    id: string,
    action: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
    comment?: string,
  ) {
    if (
      !(
        [UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN] as UserRole[]
      ).includes(role)
    )
      throw new ForbiddenException();
    const t = await this.prisma.template.findFirst({
      where: { id, deletedAt: null },
    });
    if (!t) throw new NotFoundException();
    if (t.ownerId === actorId)
      throw new ForbiddenException('Owners cannot review their own templates');
    if (t.reviewStatus !== 'PENDING')
      throw new ConflictException('Template is not pending');
    if (action !== 'APPROVED' && !comment)
      throw problem('TEMPLATE_INVALID_PAYLOAD', 'A comment is required');
    if (action === 'APPROVED') return this.publish(actorId, t.id, comment);
    const status: TemplateReviewStatus =
      action === 'REJECTED' ? 'REJECTED' : 'DRAFT';
    return this.prisma.$transaction(async (tx) => {
      const out = await tx.template.update({
        where: { id },
        data: { reviewStatus: status, rejectionReason: comment },
      });
      await tx.templateReview.create({
        data: { templateId: id, reviewerId: actorId, action, comment },
      });
      return out;
    });
  }
  private async publish(actorId: string, id: string, comment?: string) {
    const latest = await this.prisma.templateVersion.findFirst({
      where: { templateId: id },
      orderBy: { versionNumber: 'desc' },
      include: { items: true },
    });
    if (!latest)
      throw new ConflictException({
        code: 'TEMPLATE_NOT_READY',
        message: 'No version',
      });
    const library = {
      type: latest.libraryType,
      version: latest.librarySchemaVersion,
      source: latest.source,
      libraryItems: latest.items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((x) => ({
          id: x.externalId,
          status: 'published',
          elements: x.elementsJson,
          created: x.createdAt.getTime(),
          name: x.name ?? undefined,
          category: x.category ?? undefined,
          form: x.form ?? undefined,
          description: x.description ?? undefined,
        })),
    };
    const body = Buffer.from(JSON.stringify(library), 'utf8');
    const key = `templates/${id}/versions/${latest.id}/bundle.dlanderlib`;
    await this.storage.putObject(key, body, 'application/json');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.templateVersion.update({
            where: { id: latest.id },
            data: {
              immutable: true,
              bundleStorageKey: key,
              bundleSize: body.length,
              contentHash: sha256(body),
            },
          });
          const out = await tx.template.update({
            where: { id },
            data: {
              reviewStatus: 'APPROVED',
              currentVersionId: latest.id,
              approvedAt: new Date(),
              publishedAt: new Date(),
            },
          });
          await tx.templateReview.create({
            data: {
              templateId: id,
              reviewerId: actorId,
              action: 'APPROVED',
              comment,
            },
          });
          return out;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw e;
    }
  }
  async unpublish(actorId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const out = await tx.template.update({
        where: { id },
        data: { visibility: 'PRIVATE', currentVersionId: null },
      });
      await tx.templateReview.create({
        data: { templateId: id, reviewerId: actorId, action: 'UNPUBLISHED' },
      });
      return out;
    });
  }
  async publicList(q: ListTemplatesDto) {
    return this.page(
      {
        deletedAt: null,
        visibility: 'PUBLIC',
        reviewStatus: 'APPROVED',
        lifecycleStatus: 'ACTIVE',
        currentVersionId: { not: null },
      },
      q,
      false,
    );
  }
  private async page(
    base: Prisma.TemplateWhereInput,
    q: ListTemplatesDto,
    manage: boolean,
  ) {
    const where: Prisma.TemplateWhereInput = {
      ...base,
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.owner ? { ownerId: q.owner } : {}),
      ...(q.form
        ? { currentVersion: { items: { some: { form: q.form } } } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
              {
                versions: {
                  some: {
                    items: {
                      some: {
                        name: { contains: q.search, mode: 'insensitive' },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.TemplateOrderByWithRelationInput =
      q.sort === 'title'
        ? { title: 'asc' }
        : q.sort === 'updated'
          ? { updatedAt: 'desc' }
          : { publishedAt: 'desc' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.template.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy,
        include: {
          category: true,
          currentVersion: { include: { items: true } },
        },
      }),
      this.prisma.template.count({ where }),
    ]);
    return {
      items: items.map((x) =>
        manage ? this.enrichTemplate(x) : this.serializePublic(x),
      ),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async publicOne(slug: string) {
    const t = await this.prisma.template.findFirst({
      where: {
        slug,
        deletedAt: null,
        reviewStatus: 'APPROVED',
        lifecycleStatus: 'ACTIVE',
        visibility: { in: ['PUBLIC', 'UNLISTED'] },
        currentVersionId: { not: null },
      },
      include: {
        category: true,
        currentVersion: { include: { items: true } },
        owner: { select: { id: true, displayName: true } },
      },
    });
    if (!t)
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found',
      });
    return this.serializePublic(t);
  }
  private serializePublic(t: any) {
    const previewUrl = this.previewUrl(t.currentVersion);
    return {
      id: t.id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      tags: t.tags,
      visibility: t.visibility,
      category: t.category,
      owner: t.owner,
      previewUrl,
      currentVersion: t.currentVersion && {
        versionNumber: t.currentVersion.versionNumber,
        previewUrl,
        items: t.currentVersion.items.map((x: any) => ({
          id: x.externalId,
          name: x.name,
          description: x.description,
          category: x.category,
          form: x.form,
          elements: x.elementsJson,
        })),
      },
      downloadUrl:
        t.visibility === 'PUBLIC'
          ? `/api/v1/public/templates/${t.slug}/download`
          : null,
    };
  }

  private enrichTemplate<T extends Record<string, any>>(t: T) {
    const previewUrl = this.previewUrl(t.currentVersion);
    return {
      ...t,
      previewUrl,
      currentVersion: t.currentVersion
        ? this.enrichVersion(t.currentVersion)
        : t.currentVersion,
      downloadUrl:
        t.visibility === 'PUBLIC'
          ? `/api/v1/public/templates/${t.slug}/download`
          : null,
    };
  }

  private enrichVersion<T extends Record<string, any>>(v: T) {
    return {
      ...v,
      previewUrl: this.previewUrl(v),
    };
  }

  private previewUrl(version?: { previewStorageKey?: string | null } | null) {
    if (!version?.previewStorageKey) return null;
    return this.publicObjectUrl(version.previewStorageKey);
  }

  publicObjectUrl(key: string) {
    const base = this.config
      .get('TEMPLATE_STORAGE_PUBLIC_BASE_URL', '')
      .replace(/\/$/, '');
    if (!base) return null;
    return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async streamPublicObject(key: string) {
    if (
      !/^templates\/[0-9a-f-]{36}\/versions\/[0-9a-f-]{36}\/preview\.(jpe?g|png)$/i.test(
        key,
      )
    )
      throw new NotFoundException('Object not found');
    if (!(await this.storage.objectExists(key)))
      throw new NotFoundException('Object not found');
    return this.storage.streamObject(key);
  }
  async download(slug: string, versionNumber?: number) {
    const t = await this.prisma.template.findFirst({
      where: {
        slug,
        deletedAt: null,
        reviewStatus: 'APPROVED',
        lifecycleStatus: 'ACTIVE',
        visibility: 'PUBLIC',
      },
      include: {
        currentVersion: true,
        versions: versionNumber ? { where: { versionNumber } } : false,
      },
    });
    const v = versionNumber ? (t as any)?.versions?.[0] : t?.currentVersion;
    if (!t || !v?.immutable || !v.bundleStorageKey)
      throw new NotFoundException();
    return {
      object: await this.storage.streamObject(v.bundleStorageKey),
      filename: `${t.slug}-v${v.versionNumber}.dlanderlib`,
      hash: v.contentHash,
    };
  }
  async createShare(ownerId: string, id: string, dto: ShareDto) {
    const t = await this.requireOwned(ownerId, id);
    if (!t.currentVersionId)
      throw new ConflictException({
        code: 'TEMPLATE_NOT_READY',
        message: 'No published version',
      });
    const token = randomBytes(32).toString('base64url');
    const share = await this.prisma.templateShare.create({
      data: {
        templateId: id,
        tokenHash: sha256(token),
        expiresAt: dto.expiresAt,
        maxUses: dto.maxUses,
      },
    });
    return {
      id: share.id,
      url: `${this.config.get('TEMPLATE_SHARE_BASE_URL', '')}/api/v1/template-shares/${token}`,
      expiresAt: share.expiresAt,
      maxUses: share.maxUses,
    };
  }
  async revokeShare(ownerId: string, id: string, shareId: string) {
    await this.requireOwned(ownerId, id);
    return this.prisma.templateShare.updateMany({
      where: { id: shareId, templateId: id },
      data: { revokedAt: new Date() },
    });
  }
  async shared(token: string) {
    const hash = sha256(token);
    return this.prisma.$transaction(
      async (tx) => {
        const share = await tx.templateShare.findUnique({
          where: { tokenHash: hash },
          include: {
            template: {
              include: {
                category: true,
                currentVersion: { include: { items: true } },
              },
            },
          },
        });
        if (
          !share ||
          share.revokedAt ||
          (share.expiresAt && share.expiresAt <= new Date()) ||
          (share.maxUses !== null && share.useCount >= share.maxUses)
        )
          throw new NotFoundException({
            code: 'TEMPLATE_SHARE_EXPIRED',
            message: 'Share is invalid or expired',
          });
        await tx.templateShare.update({
          where: { id: share.id },
          data: { useCount: { increment: 1 } },
        });
        return this.serializePublic(share.template);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async event(
    id: string,
    type: TemplateMetricType,
    userId?: string,
    visitor = 'anonymous',
  ) {
    const bucket = new Date().toISOString().slice(0, 13);
    const dedupeKey = sha256(`${id}:${type}:${userId ?? visitor}:${bucket}`);
    await this.prisma.templateMetric.upsert({
      where: { dedupeKey },
      create: {
        templateId: id,
        type,
        userId,
        dedupeKey,
        visitorHash: sha256(visitor),
      },
      update: {},
    });
    return { accepted: true };
  }
  categories() {
    return this.prisma.templateCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  reviewQueue(q: ListTemplatesDto) {
    return this.page({ deletedAt: null, reviewStatus: 'PENDING' }, q, true);
  }
  adminList(q: AdminTemplateQueryDto) {
    return this.page(
      {
        deletedAt: null,
        reviewStatus: q.reviewStatus,
        visibility: q.visibility,
      },
      q,
      true,
    );
  }
  async adminLifecycle(id: string, archived: boolean) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null },
    });
    if (!template)
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found',
      });
    return this.prisma.template.update({
      where: { id },
      data: { lifecycleStatus: archived ? 'ARCHIVED' : 'ACTIVE' },
    });
  }
  async adminRemove(id: string) {
    const result = await this.prisma.template.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        lifecycleStatus: 'ARCHIVED',
        visibility: 'PRIVATE',
      },
    });
    if (!result.count)
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found',
      });
    return { id, deleted: true };
  }
  adminCategories() {
    return this.prisma.templateCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { templates: true } } },
    });
  }
  async createCategory(dto: CreateTemplateCategoryDto) {
    try {
      return await this.prisma.templateCategory.create({
        data: {
          ...dto,
          slug: dto.slug.toLowerCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'TEMPLATE_CATEGORY_CONFLICT',
          message: 'Category slug already exists',
        });
      throw error;
    }
  }
  async updateCategory(id: string, dto: UpdateTemplateCategoryDto) {
    try {
      return await this.prisma.templateCategory.update({
        where: { id },
        data: {
          ...dto,
          slug: dto.slug?.toLowerCase(),
          name: dto.name?.trim(),
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundException('Template category not found');
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'TEMPLATE_CATEGORY_CONFLICT',
          message: 'Category slug already exists',
        });
      throw error;
    }
  }
  async deleteCategory(id: string) {
    const category = await this.prisma.templateCategory.findUnique({
      where: { id },
      include: { _count: { select: { templates: true } } },
    });
    if (!category) throw new NotFoundException('Template category not found');
    if (category._count.templates)
      return this.prisma.templateCategory.update({
        where: { id },
        data: { isActive: false },
      });
    await this.prisma.templateCategory.delete({ where: { id } });
    return { id, deleted: true };
  }
}
