import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SessionClientType, UserStatus } from '@prisma/client';
import { Request } from 'express';
import { AccessPrincipal, JwtClaims } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConnectedWordPressSite,
  WordPressInstallationService,
} from './wordpress-installation.service';

export type RequestWithWordPressSite = Request & {
  user?: AccessPrincipal;
  wordpressSite?: ConnectedWordPressSite;
};

@Injectable()
export class WordPressInstallationGuard implements CanActivate {
  constructor(private readonly installations: WordPressInstallationService) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithWordPressSite>();
    request.wordpressSite =
      await this.installations.resolveFromRequest(request);
    return true;
  }
}

/** Allows either a web Bearer access token or WordPress installation headers. */
@Injectable()
export class WordPressOrWebGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly installations: WordPressInstallationService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithWordPressSite>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme === 'Bearer' && token) {
      try {
        const claims = await this.jwt.verifyAsync<JwtClaims>(token, {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        });
        if (claims.type !== 'access') throw new Error('Wrong token type');
        const session = await this.prisma.session.findUnique({
          where: { id: claims.sid },
          include: { user: true },
        });
        if (
          !session ||
          session.userId !== claims.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.user.status !== UserStatus.ACTIVE ||
          session.clientType !== SessionClientType.WEB
        )
          throw new Error('Inactive session');
        request.user = {
          userId: session.user.id,
          sessionId: session.id,
          email: session.user.email,
          role: session.user.role,
          plan: session.user.plan,
          status: session.user.status,
          client: 'web',
        };
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
    }
    if (
      request.get('x-dlander-installation-key') &&
      request.get('x-dlander-site-url')
    ) {
      request.wordpressSite =
        await this.installations.resolveFromRequest(request);
      return true;
    }
    throw new UnauthorizedException('Authentication required');
  }
}
