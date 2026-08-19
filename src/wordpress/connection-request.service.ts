import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  WordPressConnectionRequest,
  WordPressConnectionRequestStatus,
} from '@prisma/client';
import { hashOpaqueToken } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConnectionRequestDto } from './wordpress.dto';
import { normalizeWordPressDomain } from './wordpress-site';

const problem = (code: string, message: string, status: 400 | 403 | 404 = 400) => {
  if (status === 404) return new NotFoundException({ code, message });
  if (status === 403) return new ForbiddenException({ code, message });
  return new BadRequestException({ code, message });
};

const PENDING_TTL_MS = 15 * 60_000;

@Injectable()
export class ConnectionRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateConnectionRequestDto) {
    const domain = normalizeWordPressDomain(dto.siteUrl);
    const installationKeyHash = hashOpaqueToken(dto.installationKey);
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
    await this.prisma.wordPressConnectionRequest.updateMany({
      where: {
        domain,
        status: WordPressConnectionRequestStatus.PENDING,
      },
      data: { status: WordPressConnectionRequestStatus.EXPIRED },
    });
    const request = await this.prisma.wordPressConnectionRequest.create({
      data: {
        domain,
        siteName: dto.siteName?.trim(),
        installationKeyHash,
        metadataJson: dto.metadata as Prisma.InputJsonValue | undefined,
        expiresAt,
      },
    });
    const frontend = this.config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
    return {
      requestId: request.id,
      status: request.status,
      domain: request.domain,
      expiresAt: request.expiresAt,
      approveUrl: `${frontend}/connect/wordpress?requestId=${request.id}`,
    };
  }

  async get(id: string) {
    const request = await this.refreshExpiry(id);
    return this.publicView(request);
  }

  async approve(id: string, userId: string) {
    const request = await this.requirePending(id);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.wordPressSite.findUnique({
        where: { userId_domain: { userId, domain: request.domain } },
      });
      const site = existing
        ? await tx.wordPressSite.update({
            where: { id: existing.id },
            data: {
              name: request.siteName ?? existing.name,
              installationKeyHash: request.installationKeyHash,
              metadataJson:
                (request.metadataJson as Prisma.InputJsonValue | undefined) ??
                existing.metadataJson ??
                undefined,
              enabled: true,
              lastConnectedAt: new Date(),
            },
          })
        : await tx.wordPressSite.create({
            data: {
              userId,
              domain: request.domain,
              name: request.siteName,
              installationKeyHash: request.installationKeyHash,
              metadataJson: request.metadataJson as
                | Prisma.InputJsonValue
                | undefined,
              lastConnectedAt: new Date(),
            },
          });
      const updated = await tx.wordPressConnectionRequest.update({
        where: { id: request.id },
        data: {
          status: WordPressConnectionRequestStatus.APPROVED,
          userId,
          wordpressSiteId: site.id,
        },
      });
      return { request: updated, site };
    });
    return {
      ...this.publicView(result.request),
      site: {
        id: result.site.id,
        domain: result.site.domain,
        name: result.site.name,
        enabled: result.site.enabled,
      },
    };
  }

  async deny(id: string, userId: string) {
    const request = await this.requirePending(id);
    const updated = await this.prisma.wordPressConnectionRequest.update({
      where: { id: request.id },
      data: {
        status: WordPressConnectionRequestStatus.DENIED,
        userId,
      },
    });
    return this.publicView(updated);
  }

  private async requirePending(id: string) {
    const request = await this.refreshExpiry(id);
    if (request.status === WordPressConnectionRequestStatus.EXPIRED)
      throw problem(
        'CONNECTION_REQUEST_EXPIRED',
        'Connection request has expired',
      );
    if (request.status === WordPressConnectionRequestStatus.DENIED)
      throw problem(
        'CONNECTION_REQUEST_DENIED',
        'Connection request was denied',
      );
    if (request.status !== WordPressConnectionRequestStatus.PENDING)
      throw problem(
        'CONNECTION_REQUEST_NOT_PENDING',
        'Connection request is not pending',
      );
    return request;
  }

  private async refreshExpiry(id: string): Promise<WordPressConnectionRequest> {
    const request = await this.prisma.wordPressConnectionRequest.findUnique({
      where: { id },
    });
    if (!request)
      throw problem(
        'CONNECTION_REQUEST_NOT_FOUND',
        'Connection request not found',
        404,
      );
    if (
      request.status === WordPressConnectionRequestStatus.PENDING &&
      request.expiresAt <= new Date()
    ) {
      return this.prisma.wordPressConnectionRequest.update({
        where: { id },
        data: { status: WordPressConnectionRequestStatus.EXPIRED },
      });
    }
    return request;
  }

  private publicView(request: WordPressConnectionRequest) {
    return {
      requestId: request.id,
      domain: request.domain,
      siteName: request.siteName,
      status: request.status,
      expiresAt: request.expiresAt,
      wordpressSiteId: request.wordpressSiteId,
      createdAt: request.createdAt,
    };
  }
}
