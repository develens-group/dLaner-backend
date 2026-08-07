import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  Prisma,
  SessionClientType,
  User,
  UserPlan,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { durationMs } from '../common/duration';
import { ClientContext } from '../common/request-context';
import {
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
} from '../common/security';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { JwtClaims } from '../common/auth.types';
import { WordPressLoginDto } from '../wordpress/wordpress.dto';
import { normalizeWordPressDomain } from '../wordpress/wordpress-site';

const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  plan: user.plan,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Unable to create account');
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const verificationRequired = this.verificationRequired();
    const token = verificationRequired ? createOpaqueToken() : undefined;
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName?.trim(),
          plan: UserPlan.FREE,
          status: verificationRequired
            ? UserStatus.PENDING_VERIFICATION
            : UserStatus.ACTIVE,
        },
      });
      if (token)
        await tx.emailVerificationToken.create({
          data: {
            userId: created.id,
            tokenHash: hashOpaqueToken(token),
            expiresAt: this.expiry('EMAIL_VERIFICATION_EXPIRES_IN'),
          },
        });
      return created;
    });
    if (token) await this.mail.sendVerification(user.email, token);
    return {
      user: publicUser(user),
      message: verificationRequired
        ? 'Registration successful. Check your email to verify your account.'
        : 'Registration successful. Your account is active.',
    };
  }

  async verifyEmail(token: string) {
    this.assertVerificationEnabled();
    const tokenHash = hashOpaqueToken(token);
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
      });
      if (!record || record.usedAt || record.expiresAt <= new Date())
        throw new BadRequestException('Invalid or expired verification token');
      const changed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!changed.count)
        throw new BadRequestException(
          'Verification token has already been used',
        );
      await tx.user.update({
        where: { id: record.userId },
        data: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
      });
    });
    return { message: 'Email verified successfully' };
  }

  async resendVerification(emailInput: string) {
    this.assertVerificationEnabled();
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.status === UserStatus.PENDING_VERIFICATION) {
      const token = createOpaqueToken();
      await this.prisma.$transaction([
        this.prisma.emailVerificationToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            expiresAt: this.expiry('EMAIL_VERIFICATION_EXPIRES_IN'),
          },
        }),
      ]);
      await this.mail.sendVerification(user.email, token);
    }
    return {
      message:
        'If the account is eligible, a verification email has been sent.',
    };
  }

  async login(dto: LoginDto, context: ClientContext) {
    const user = await this.authenticateUser(dto, context);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: 'pending',
          expiresAt: this.expiry('JWT_REFRESH_EXPIRES_IN'),
          ...context,
        },
      });
      const tokens = await this.issueTokens(user, session.id);
      await tx.session.update({
        where: { id: session.id },
        data: { refreshTokenHash: await argon2.hash(tokens.refreshToken) },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return { ...tokens, user: publicUser(user) };
    });
  }

  async wordpressLogin(dto: WordPressLoginDto, context: ClientContext) {
    const user = await this.authenticateUser(dto, context);
    const domain = normalizeWordPressDomain(dto.siteUrl);
    const installationKey = createOpaqueToken();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.wordPressSite.findUnique({
        where: { userId_domain: { userId: user.id, domain } },
      });
      if (existing && !existing.enabled)
        throw new ForbiddenException('This WordPress site is disabled');
      const site = existing
        ? await tx.wordPressSite.update({
            where: { id: existing.id },
            data: {
              name: dto.siteName?.trim() ?? existing.name,
              metadataJson: dto.metadata as Prisma.InputJsonValue | undefined,
              installationKeyHash: hashOpaqueToken(installationKey),
              lastConnectedAt: new Date(),
            },
          })
        : await tx.wordPressSite.create({
            data: {
              userId: user.id,
              domain,
              name: dto.siteName?.trim(),
              metadataJson: dto.metadata as Prisma.InputJsonValue | undefined,
              installationKeyHash: hashOpaqueToken(installationKey),
              lastConnectedAt: new Date(),
            },
          });
      await tx.session.updateMany({
        where: { wordpressSiteId: site.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const session = await tx.session.create({
        data: {
          userId: user.id,
          clientType: SessionClientType.WORDPRESS,
          wordpressSiteId: site.id,
          refreshTokenHash: 'pending',
          expiresAt: this.expiry('JWT_REFRESH_EXPIRES_IN'),
          ...context,
        },
      });
      const tokens = await this.issueTokens(user, session.id, 'wordpress');
      await tx.session.update({
        where: { id: session.id },
        data: { refreshTokenHash: await argon2.hash(tokens.refreshToken) },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return {
        ...tokens,
        installationKey,
        site: { id: site.id, domain: site.domain, enabled: site.enabled },
        user: publicUser(user),
      };
    });
  }

  async createCaptcha(email: string, context: ClientContext) {
    const scopeHash = this.loginScope(email, context.ipAddress);
    const protection = await this.prisma.loginProtection.findUnique({
      where: { scopeHash },
    });
    if (!protection || protection.failureCount < this.captchaThreshold())
      throw new BadRequestException('Captcha is not required yet');
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = Array.from(
      { length: 5 },
      () => alphabet[randomInt(0, alphabet.length)],
    ).join('');
    const challenge = await this.prisma.captchaChallenge.create({
      data: {
        scopeHash,
        answerHash: hashOpaqueToken(code),
        expiresAt: new Date(
          Date.now() +
            this.config.get<number>('CAPTCHA_TTL_SECONDS', 300) * 1000,
        ),
      },
    });
    const chars = [...code]
      .map(
        (char, index) =>
          `<text x="${18 + index * 27}" y="43" transform="rotate(${randomInt(-12, 13)} ${18 + index * 27} 43)">${char}</text>`,
      )
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60" viewBox="0 0 160 60"><rect width="160" height="60" fill="#f3f4f6"/><path d="M0 14L160 48M0 49L160 11M8 30L152 27" stroke="#94a3b8" stroke-width="1"/><g fill="#172554" font-family="monospace" font-size="28" font-weight="700">${chars}</g></svg>`;
    return {
      captchaId: challenge.id,
      image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      expiresAt: challenge.expiresAt,
    };
  }

  private async authenticateUser(dto: LoginDto, context: ClientContext) {
    const scopeHash = this.loginScope(dto.email, context.ipAddress);
    const protection = await this.prisma.loginProtection.findUnique({
      where: { scopeHash },
    });
    if ((protection?.failureCount ?? 0) >= this.captchaThreshold()) {
      await this.validateCaptcha(scopeHash, dto);
    }
    let user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    const dummy =
      '$argon2id$v=19$m=65536,t=3,p=4$MDAwMDAwMDAwMDAwMDAwMA$+WfJQw1uY6dYxe8GQ8jvbA';
    const valid = await argon2
      .verify(user?.passwordHash ?? dummy, dto.password)
      .catch(() => false);
    if (!user || !valid) {
      const failed = await this.prisma.loginProtection.upsert({
        where: { scopeHash },
        create: { scopeHash, failureCount: 1 },
        update: { failureCount: { increment: 1 }, lastFailedAt: new Date() },
      });
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code:
          failed.failureCount >= this.captchaThreshold()
            ? 'CAPTCHA_REQUIRED'
            : 'INVALID_LOGIN',
        captchaRequired: failed.failureCount >= this.captchaThreshold(),
      });
    }
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      if (this.verificationRequired())
        throw new ForbiddenException('Email verification is required');
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      });
    }
    if (user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('Account is unavailable');
    await this.prisma.loginProtection.deleteMany({ where: { scopeHash } });
    return user;
  }

  private async validateCaptcha(scopeHash: string, dto: LoginDto) {
    if (!dto.captchaId || !dto.captchaCode)
      throw new UnauthorizedException({
        message: 'Captcha is required',
        code: 'CAPTCHA_REQUIRED',
        captchaRequired: true,
      });
    const challenge = await this.prisma.captchaChallenge.findUnique({
      where: { id: dto.captchaId },
    });
    const valid =
      challenge &&
      challenge.scopeHash === scopeHash &&
      !challenge.usedAt &&
      challenge.expiresAt > new Date() &&
      challenge.attempts < this.config.get<number>('CAPTCHA_MAX_ATTEMPTS', 5) &&
      challenge.answerHash ===
        hashOpaqueToken(dto.captchaCode.trim().toUpperCase());
    if (!valid) {
      if (challenge && !challenge.usedAt)
        await this.prisma.captchaChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
      throw new UnauthorizedException({
        message: 'Invalid or expired captcha',
        code: 'INVALID_CAPTCHA',
        captchaRequired: true,
      });
    }
    const consumed = await this.prisma.captchaChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!consumed.count)
      throw new UnauthorizedException({
        message: 'Invalid or expired captcha',
        code: 'INVALID_CAPTCHA',
        captchaRequired: true,
      });
  }

  private loginScope(email: string, ipAddress?: string) {
    return hashOpaqueToken(
      `${normalizeEmail(email)}|${ipAddress ?? 'unknown'}`,
    );
  }

  private captchaThreshold() {
    return this.config.get<number>('CAPTCHA_FAILURE_THRESHOLD', 2);
  }

  async refresh(rawToken: string, installationKey?: string, siteUrl?: string) {
    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync(rawToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (claims.type !== 'refresh')
      throw new UnauthorizedException('Invalid refresh token');
    const result = await this.prisma.$transaction(
      async (tx) => {
        const session = await tx.session.findUnique({
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
          throw new UnauthorizedException('Invalid refresh token');
        if (session.clientType === SessionClientType.WORDPRESS) {
          if (
            !session.wordpressSite ||
            !session.wordpressSite.enabled ||
            !installationKey ||
            hashOpaqueToken(installationKey) !==
              session.wordpressSite.installationKeyHash ||
            !siteUrl ||
            normalizeWordPressDomain(siteUrl) !== session.wordpressSite.domain
          )
            throw new UnauthorizedException(
              'WordPress installation verification failed',
            );
        }
        const matches = await argon2
          .verify(session.refreshTokenHash, rawToken)
          .catch(() => false);
        if (!matches) {
          await tx.session.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
          return null;
        }
        const tokens = await this.issueTokens(
          session.user,
          session.id,
          session.clientType === SessionClientType.WORDPRESS
            ? 'wordpress'
            : 'web',
        );
        const changed = await tx.session.updateMany({
          where: {
            id: session.id,
            refreshTokenHash: session.refreshTokenHash,
            revokedAt: null,
          },
          data: {
            refreshTokenHash: await argon2.hash(tokens.refreshToken),
            lastUsedAt: new Date(),
          },
        });
        if (!changed.count)
          throw new UnauthorizedException('Refresh token already rotated');
        return tokens;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!result)
      throw new UnauthorizedException('Refresh token reuse detected');
    return result;
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logged out' };
  }
  async logoutAll(userId: string) {
    await this.revokeAll(userId);
    return { message: 'Logged out from all sessions' };
  }
  async forgotPassword(emailInput: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(emailInput) },
    });
    if (user?.status === UserStatus.ACTIVE) {
      const token = createOpaqueToken();
      await this.prisma.$transaction([
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            expiresAt: this.expiry('PASSWORD_RESET_EXPIRES_IN'),
          },
        }),
      ]);
      await this.mail.sendPasswordReset(user.email, token);
    }
    return {
      message:
        'If an eligible account exists, password reset instructions have been sent.',
    };
  }
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashOpaqueToken(dto.token);
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!record || record.usedAt || record.expiresAt <= new Date())
        throw new BadRequestException('Invalid or expired reset token');
      const changed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!changed.count)
        throw new BadRequestException('Reset token has already been used');
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { message: 'Password reset successfully' };
  }
  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword)))
      throw new UnauthorizedException('Current password is incorrect');
    if (await argon2.verify(user.passwordHash, dto.newPassword))
      throw new BadRequestException(
        'New password must differ from current password',
      );
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Password changed; other sessions were revoked' };
  }
  private expiry(key: string) {
    return new Date(
      Date.now() + durationMs(this.config.getOrThrow<string>(key)),
    );
  }
  private verificationRequired() {
    return this.config.get('EMAIL_VERIFICATION_REQUIRED', 'false') === 'true';
  }
  private assertVerificationEnabled() {
    if (!this.verificationRequired())
      throw new ForbiddenException('Email verification is currently disabled');
  }
  private async issueTokens(
    user: User,
    sessionId: string,
    client: 'web' | 'wordpress' = 'web',
  ) {
    const base = { sub: user.id, sid: sessionId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        {
          ...base,
          type: 'access',
          role: user.role,
          plan: user.plan,
          email: user.email,
          client,
        },
        {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
        },
      ),
      this.jwt.signAsync(
        { ...base, type: 'refresh', client },
        {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
  private async revokeAll(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
