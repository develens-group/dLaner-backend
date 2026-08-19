import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  WordPressEditSessionStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  OBJECT_STORAGE,
  type ObjectStorageService,
} from '../templates/template-storage';
import type { ConnectedWordPressSite } from './wordpress-installation.service';
import {
  CompleteEditSessionDto,
  CreateEditSessionDto,
} from './wordpress.dto';

const problem = (code: string, message: string, status: 400 | 403 | 404 = 400) => {
  if (status === 404) return new NotFoundException({ code, message });
  if (status === 403) return new ForbiddenException({ code, message });
  return new BadRequestException({ code, message });
};

const EDIT_TTL_MS = 8 * 60 * 60_000;
const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const ALLOWED: Record<string, { kind: 'image' | 'video'; max: number }> = {
  'image/jpeg': { kind: 'image', max: IMAGE_MAX },
  'image/png': { kind: 'image', max: IMAGE_MAX },
  'image/webp': { kind: 'image', max: IMAGE_MAX },
  'image/gif': { kind: 'image', max: IMAGE_MAX },
  'video/mp4': { kind: 'video', max: VIDEO_MAX },
  'video/webm': { kind: 'video', max: VIDEO_MAX },
};

@Injectable()
export class EditSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageService,
  ) {}

  async create(site: ConnectedWordPressSite, dto: CreateEditSessionDto) {
    const session = await this.prisma.wordPressEditSession.create({
      data: {
        userId: site.userId,
        wordpressSiteId: site.id,
        expiresAt: new Date(Date.now() + EDIT_TTL_MS),
        inputText: dto.inputText,
        inputJson: dto.inputJson as Prisma.InputJsonValue | undefined,
      },
    });
    return this.view(session.id);
  }

  async getForWeb(sessionId: string, userId: string) {
    const session = await this.loadFresh(sessionId);
    if (session.userId !== userId)
      throw new ForbiddenException('Access denied');
    return this.view(session.id);
  }

  async getForPlugin(sessionId: string, site: ConnectedWordPressSite) {
    const session = await this.loadFresh(sessionId);
    if (session.wordpressSiteId !== site.id)
      throw new ForbiddenException('Access denied');
    return this.view(session.id);
  }

  async getDual(
    sessionId: string,
    opts: { userId?: string; site?: ConnectedWordPressSite },
  ) {
    if (opts.userId) return this.getForWeb(sessionId, opts.userId);
    if (opts.site) return this.getForPlugin(sessionId, opts.site);
    throw new ForbiddenException('Access denied');
  }

  async complete(
    sessionId: string,
    userId: string,
    dto: CompleteEditSessionDto,
  ) {
    const session = await this.loadFresh(sessionId);
    if (session.userId !== userId)
      throw new ForbiddenException('Access denied');
    if (session.status === WordPressEditSessionStatus.COMPLETED)
      throw problem(
        'EDIT_SESSION_ALREADY_COMPLETED',
        'Edit session already completed',
      );
    if (session.status !== WordPressEditSessionStatus.OPEN)
      throw problem('EDIT_SESSION_EXPIRED', 'Edit session is not open');
    await this.prisma.wordPressEditSession.update({
      where: { id: sessionId },
      data: {
        status: WordPressEditSessionStatus.COMPLETED,
        outputText: dto.outputText,
        outputJson: dto.outputJson as Prisma.InputJsonValue | undefined,
        completedAt: new Date(),
      },
    });
    return this.view(sessionId);
  }

  async result(sessionId: string, site: ConnectedWordPressSite) {
    const session = await this.loadFresh(sessionId);
    if (session.wordpressSiteId !== site.id)
      throw new ForbiddenException('Access denied');
    if (session.status !== WordPressEditSessionStatus.COMPLETED)
      throw problem(
        'EDIT_SESSION_NOT_READY',
        'Edit session result is not ready yet',
      );
    return this.view(sessionId);
  }

  async addAsset(
    sessionId: string,
    site: ConnectedWordPressSite,
    file: Express.Multer.File,
    direction: 'input' | 'output' = 'input',
  ) {
    const session = await this.loadFresh(sessionId);
    if (session.wordpressSiteId !== site.id)
      throw new ForbiddenException('Access denied');
    if (session.status !== WordPressEditSessionStatus.OPEN)
      throw problem('EDIT_SESSION_EXPIRED', 'Edit session is not open');
    const meta = ALLOWED[file.mimetype];
    if (!meta)
      throw problem(
        'UNSUPPORTED_MEDIA',
        `Unsupported media type: ${file.mimetype}`,
      );
    if (file.size > meta.max)
      throw problem('FILE_TOO_LARGE', 'Uploaded file exceeds size limit');
    const safeName = (file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const assetId = randomUUID();
    const storageKey = `wordpress-edit/${site.userId}/${sessionId}/${assetId}-${safeName}`;
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    const asset = await this.prisma.wordPressEditAsset.create({
      data: {
        editSessionId: sessionId,
        direction,
        kind: meta.kind,
        storageKey,
        contentType: file.mimetype,
        byteSize: file.size,
        originalName: file.originalname?.slice(0, 255),
      },
    });
    const downloadUrl = await this.storage.createSignedDownloadUrl(storageKey);
    return {
      id: asset.id,
      kind: asset.kind,
      direction: asset.direction,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      originalName: asset.originalName,
      downloadUrl,
      createdAt: asset.createdAt,
    };
  }

  async addOutputAsset(
    sessionId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const session = await this.loadFresh(sessionId);
    if (session.userId !== userId)
      throw new ForbiddenException('Access denied');
    if (session.status !== WordPressEditSessionStatus.OPEN)
      throw problem('EDIT_SESSION_EXPIRED', 'Edit session is not open');
    const site = await this.prisma.wordPressSite.findUniqueOrThrow({
      where: { id: session.wordpressSiteId },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    return this.addAsset(sessionId, site, file, 'output');
  }

  private async loadFresh(id: string) {
    const session = await this.prisma.wordPressEditSession.findUnique({
      where: { id },
    });
    if (!session)
      throw problem('EDIT_SESSION_NOT_FOUND', 'Edit session not found', 404);
    if (
      session.status === WordPressEditSessionStatus.OPEN &&
      session.expiresAt <= new Date()
    ) {
      return this.prisma.wordPressEditSession.update({
        where: { id },
        data: { status: WordPressEditSessionStatus.EXPIRED },
      });
    }
    if (session.status === WordPressEditSessionStatus.EXPIRED)
      throw problem('EDIT_SESSION_EXPIRED', 'Edit session has expired');
    return session;
  }

  private async view(sessionId: string) {
    const session = await this.prisma.wordPressEditSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { assets: { orderBy: { createdAt: 'asc' } } },
    });
    const frontend = this.config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
    const assets = await Promise.all(
      session.assets.map(async (asset) => ({
        id: asset.id,
        kind: asset.kind,
        direction: asset.direction,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        originalName: asset.originalName,
        downloadUrl: await this.storage.createSignedDownloadUrl(
          asset.storageKey,
        ),
        createdAt: asset.createdAt,
      })),
    );
    return {
      id: session.id,
      status: session.status,
      wordpressSiteId: session.wordpressSiteId,
      expiresAt: session.expiresAt,
      inputText: session.inputText,
      inputJson: session.inputJson,
      outputText: session.outputText,
      outputJson: session.outputJson,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      editorUrl: `${frontend}/editor/wordpress?sessionId=${session.id}`,
      assets,
    };
  }
}
