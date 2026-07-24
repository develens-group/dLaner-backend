import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Request } from 'express';
import { AccessPrincipal, JwtClaims } from '../common/auth.types';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

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
        include: { user: true },
      });
      if (
        !session ||
        session.userId !== claims.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== UserStatus.ACTIVE
      )
        throw new Error('Inactive session');
      request.user = {
        userId: session.user.id,
        sessionId: session.id,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
