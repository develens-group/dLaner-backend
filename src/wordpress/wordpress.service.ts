import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createOpaqueToken, hashOpaqueToken } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWordPressSiteDto } from './wordpress.dto';

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

  async update(userId: string, id: string, dto: UpdateWordPressSiteDto) {
    await this.owned(userId, id);
    const site = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.wordPressSite.update({
        where: { id },
        data: { name: dto.name?.trim(), enabled: dto.enabled },
        select: siteSelect,
      });
      if (dto.enabled === false)
        await tx.session.updateMany({
          where: { wordpressSiteId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return updated;
    });
    return site;
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.wordPressSite.delete({ where: { id } });
    return { message: 'WordPress site disconnected' };
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
