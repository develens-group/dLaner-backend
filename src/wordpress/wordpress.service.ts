import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createOpaqueToken, hashOpaqueToken } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWordPressSiteDto,
  UpdateWordPressSiteDto,
} from './wordpress.dto';
import { normalizeWordPressDomain } from './wordpress-site';

const siteSelect = {
  id: true,
  name: true,
  domain: true,
  enabled: true,
  metadataJson: true,
  lastConnectedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class WordPressService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.wordPressSite.findMany({
      where: { userId },
      select: siteSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateWordPressSiteDto) {
    const installationKey = createOpaqueToken();
    try {
      const site = await this.prisma.wordPressSite.create({
        data: {
          userId,
          domain: normalizeWordPressDomain(dto.domain),
          name: dto.name?.trim(),
          installationKeyHash: hashOpaqueToken(installationKey),
        },
        select: siteSelect,
      });
      return { ...site, installationKey };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('This WordPress domain already exists');
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateWordPressSiteDto) {
    await this.owned(userId, id);
    const domain = dto.domain
      ? normalizeWordPressDomain(dto.domain)
      : undefined;
    try {
      const site = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.wordPressSite.update({
          where: { id },
          data: { domain, name: dto.name?.trim(), enabled: dto.enabled },
          select: siteSelect,
        });
        if (domain || dto.enabled === false)
          await tx.session.updateMany({
            where: { wordpressSiteId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        return updated;
      });
      return site;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('This WordPress domain already exists');
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.wordPressSite.delete({ where: { id } });
    return { message: 'WordPress site removed' };
  }

  async rotateKey(userId: string, id: string) {
    await this.owned(userId, id);
    const installationKey = createOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.wordPressSite.update({
        where: { id },
        data: { installationKeyHash: hashOpaqueToken(installationKey) },
      }),
      this.prisma.session.updateMany({
        where: { wordpressSiteId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { installationKey };
  }

  private async owned(userId: string, id: string) {
    const site = await this.prisma.wordPressSite.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('WordPress site not found');
    if (site.userId !== userId) throw new ForbiddenException('Access denied');
    return site;
  }
}
