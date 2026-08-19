import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WordPressSite } from '@prisma/client';
import { Request } from 'express';
import { hashOpaqueToken, safeHashEqual } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeWordPressDomain } from './wordpress-site';

export type ConnectedWordPressSite = WordPressSite & {
  user: { id: string; email: string; status: string };
};

@Injectable()
export class WordPressInstallationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFromRequest(req: Request): Promise<ConnectedWordPressSite> {
    const installationKey = req.get('x-dlander-installation-key');
    const siteUrl = req.get('x-dlander-site-url');
    if (!installationKey || !siteUrl)
      throw new UnauthorizedException({
        code: 'INVALID_INSTALLATION_KEY',
        message: 'Installation key and site URL headers are required',
      });
    return this.resolve(installationKey, siteUrl);
  }

  async resolve(
    installationKey: string,
    siteUrl: string,
  ): Promise<ConnectedWordPressSite> {
    const domain = normalizeWordPressDomain(siteUrl);
    const keyHash = hashOpaqueToken(installationKey);
    const sites = await this.prisma.wordPressSite.findMany({
      where: { domain, enabled: true },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    const site = sites.find((row) =>
      safeHashEqual(row.installationKeyHash, keyHash),
    );
    if (!site)
      throw new UnauthorizedException({
        code: 'INVALID_INSTALLATION_KEY',
        message: 'Invalid installation key or site URL',
      });
    if (!site.enabled)
      throw new ForbiddenException({
        code: 'SITE_DISABLED',
        message: 'This WordPress site connection is disabled',
      });
    if (site.user.status !== 'ACTIVE')
      throw new ForbiddenException({
        code: 'SITE_DISABLED',
        message: 'Account is unavailable',
      });
    await this.prisma.wordPressSite.update({
      where: { id: site.id },
      data: { lastConnectedAt: new Date() },
    });
    return site;
  }
}
