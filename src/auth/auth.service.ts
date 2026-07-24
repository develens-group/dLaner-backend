import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
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

const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
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
    const token = createOpaqueToken();
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash, displayName: dto.displayName?.trim() },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: this.expiry('EMAIL_VERIFICATION_EXPIRES_IN'),
        },
      });
      return created;
    });
    await this.mail.sendVerification(user.email, token);
    return {
      user: publicUser(user),
      message:
        'Registration successful. Check your email to verify your account.',
    };
  }

  async verifyEmail(token: string) {
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
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    const dummy =
      '$argon2id$v=19$m=65536,t=3,p=4$MDAwMDAwMDAwMDAwMDAwMA$+WfJQw1uY6dYxe8GQ8jvbA';
    const valid = await argon2
      .verify(user?.passwordHash ?? dummy, dto.password)
      .catch(() => false);
    if (!user || !valid)
      throw new UnauthorizedException('Invalid email or password');
    if (user.status === UserStatus.PENDING_VERIFICATION)
      throw new ForbiddenException('Email verification is required');
    if (user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('Account is unavailable');
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

  async refresh(rawToken: string) {
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
          include: { user: true },
        });
        if (
          !session ||
          session.userId !== claims.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.user.status !== UserStatus.ACTIVE
        )
          throw new UnauthorizedException('Invalid refresh token');
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
        const tokens = await this.issueTokens(session.user, session.id);
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
  private async issueTokens(user: User, sessionId: string) {
    const base = { sub: user.id, sid: sessionId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, type: 'access', role: user.role, email: user.email },
        {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
        },
      ),
      this.jwt.signAsync(
        { ...base, type: 'refresh' },
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
