import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SessionClientType, UserStatus } from '@prisma/client';
import { Request } from 'express';
import { AccessPrincipal, JwtClaims } from '../common/auth.types';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { hashOpaqueToken } from '../common/security';
import { normalizeWordPressDomain } from '../wordpress/wordpress-site';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessPrincipal }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('Authentication required');
    try {
      const claims = await this.jwt.verifyAsync<JwtClaims>(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      if (claims.type !== 'access') throw new Error('Wrong token type');
      const session = await this.prisma.session.findUnique({
        where: { id: claims.sid },
        include: { user: true, wordpressSite: true },
      });
      if (
        !session ||
        session.userId !== claims.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== UserStatus.ACTIVE
      )
        throw new Error('Inactive session');
      if (session.clientType === SessionClientType.WORDPRESS) {
        const installationKey = request.get('x-dlander-installation-key');
        const siteUrl = request.get('x-dlander-site-url');
        if (
          claims.client !== 'wordpress' ||
          !session.wordpressSite ||
          !session.wordpressSite.enabled ||
          !installationKey ||
          hashOpaqueToken(installationKey) !==
            session.wordpressSite.installationKeyHash ||
          !siteUrl ||
          normalizeWordPressDomain(siteUrl) !== session.wordpressSite.domain
        )
          throw new Error('WordPress installation verification failed');
      }
      request.user = {
        userId: session.user.id,
        sessionId: session.id,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
        client:
          session.clientType === SessionClientType.WORDPRESS
            ? 'wordpress'
            : 'web',
        wordpressSiteId: session.wordpressSiteId ?? undefined,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
