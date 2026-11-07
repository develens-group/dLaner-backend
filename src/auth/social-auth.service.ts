import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SessionClientType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hashOpaqueToken } from '../common/security';
import type { ClientContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import {
  SocialAuthProviders,
  SocialAuthError,
  asProvider,
  socialHash,
} from './social-auth.providers';
import type { SocialErrorCode } from './social-auth.providers';
import type { SocialExchangeDto, SocialStartDto } from './social-auth.dto';

type LinkContext = { userId: string; sessionId: string };
const MESSAGES: Record<SocialErrorCode, string> = {
  access_denied: 'Social sign-in was cancelled.',
  invalid_state:
    'This sign-in attempt is invalid or expired. Please start again.',
  provider_unavailable: 'This social provider is not configured.',
  provider_error:
    'The social provider could not complete sign-in. Please try again.',
  email_unavailable:
    'The provider did not share a usable email address. Share an email or use another sign-in method.',
  email_not_verified: 'Use a verified primary email with this provider.',
  account_exists:
    'An account with this email already exists. Sign in with its existing method, then link this provider in account settings.',
  account_unavailable: 'This account is unavailable.',
  identity_in_use:
    'This provider account is already linked to another account, or you have linked a different account from this provider.',
  email_verification_required:
    'Verify your email using the code sent to your inbox, then try social sign-in or linking again.',
  invalid_request: 'Invalid social sign-in request.',
};

@Injectable()
export class SocialAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: SocialAuthProviders,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  list() {
    return { providers: this.providers.list() };
  }
  private fail(code: SocialErrorCode): never {
    throw new ForbiddenException({ message: MESSAGES[code], code });
  }
  private async assertLink(
    context: LinkContext,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const session = await tx.session.findUnique({
      where: { id: context.sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== context.userId ||
      session.revokedAt ||
      session.clientType !== SessionClientType.WEB ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.deletedAt
    ) {
      this.fail('account_unavailable');
    }
    return session.user;
  }
  async start(input: string, dto: SocialStartDto, link?: LinkContext) {
    let provider;
    try {
      provider = asProvider(input);
    } catch {
      this.fail('provider_unavailable');
    }
    if (!this.providers.configured(provider)) {
      this.fail('provider_unavailable');
    }
    if (link) {
      await this.assertLink(link);
    }
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    await this.prisma.socialAuthAttempt.create({
      data: {
        provider,
        stateHash: hashOpaqueToken(state),
        clientState: dto.clientState,
        codeChallenge: dto.codeChallenge,
        providerVerifier: verifier,
        linkUserId: link?.userId,
        linkSessionId: link?.sessionId,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return {
      authorizationUrl: this.providers.authorizationUrl(
        provider,
        state,
        verifier,
      ),
    };
  }
  private redirect(values: {
    state?: string;
    code?: string;
    error?: SocialErrorCode;
  }) {
    const url = new URL(
      '/auth/social/callback',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    url.hash = new URLSearchParams(
      Object.entries(values).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ).toString();
    return url.toString();
  }
  async callback(
    input: string,
    query: { state?: unknown; code?: unknown; error?: unknown },
  ) {
    let clientState: string | undefined;
    try {
      const provider = asProvider(input);
      if (
        typeof query.state !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(query.state)
      ) {
        throw new SocialAuthError('invalid_state');
      }
      const attempt = await this.prisma.socialAuthAttempt.findUnique({
        where: { stateHash: hashOpaqueToken(query.state) },
      });
      if (
        !attempt ||
        attempt.provider !== provider ||
        attempt.usedAt ||
        attempt.expiresAt <= new Date()
      ) {
        throw new SocialAuthError('invalid_state');
      }
      const claimed = await this.prisma.socialAuthAttempt.updateMany({
        where: { id: attempt.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date(), providerVerifier: '' },
      });
      if (claimed.count !== 1) {
        throw new SocialAuthError('invalid_state');
      }
      clientState = attempt.clientState;
      if (query.error !== undefined) {
        throw new SocialAuthError('access_denied');
      }
      if (
        typeof query.code !== 'string' ||
        !/^[\x21-\x7e]{1,4096}$/.test(query.code)
      ) {
        throw new SocialAuthError('invalid_request');
      }
      const profile = await this.providers.profileForCode(
        provider,
        query.code,
        attempt.providerVerifier,
      );
      const code = randomBytes(32).toString('base64url');
      await this.prisma.socialAuthGrant.create({
        data: {
          codeHash: hashOpaqueToken(code),
          codeChallenge: attempt.codeChallenge,
          provider,
          providerAccountId: profile.subject,
          email: profile.email,
          emailTrusted: profile.emailTrusted,
          displayName: profile.displayName,
          linkUserId: attempt.linkUserId,
          linkSessionId: attempt.linkSessionId,
          expiresAt: new Date(Date.now() + 90_000),
        },
      });
      return this.redirect({ code, state: clientState });
    } catch (error) {
      return this.redirect({
        error: error instanceof SocialAuthError ? error.code : 'provider_error',
        state: clientState,
      });
    }
  }
  async exchange(dto: SocialExchangeDto, context: ClientContext) {
    const grant = await this.prisma.socialAuthGrant.findUnique({
      where: { codeHash: hashOpaqueToken(dto.code) },
    });
    const challenge = socialHash(dto.codeVerifier);
    if (
      !grant ||
      grant.usedAt ||
      grant.expiresAt <= new Date() ||
      challenge.length !== grant.codeChallenge.length ||
      !timingSafeEqual(Buffer.from(challenge), Buffer.from(grant.codeChallenge))
    ) {
      throw new UnauthorizedException({
        message: 'This sign-in grant is invalid or expired. Start again.',
        code: 'invalid_state',
      });
    }
    // Burn the grant even if a later account operation fails. Retrying requires a new flow.
    const claimed = await this.prisma.socialAuthGrant.updateMany({
      where: { id: grant.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException({
        message: 'This sign-in grant was already used.',
        code: 'invalid_state',
      });
    }
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const identity = await tx.socialIdentity.findUnique({
          where: {
            provider_providerAccountId: {
              provider: grant.provider,
              providerAccountId: grant.providerAccountId,
            },
          },
          include: { user: true },
        });
        if (grant.linkUserId) {
          if (!grant.linkSessionId) {
            this.fail('account_unavailable');
          }
          const user = await this.assertLink(
            { userId: grant.linkUserId, sessionId: grant.linkSessionId },
            tx,
          );
          if (identity && identity.userId !== user.id) {
            this.fail('identity_in_use');
          }
          const otherIdentity = await tx.socialIdentity.findUnique({
            where: {
              userId_provider: { userId: user.id, provider: grant.provider },
            },
          });
          if (
            otherIdentity &&
            otherIdentity.providerAccountId !== grant.providerAccountId
          ) {
            this.fail('identity_in_use');
          }
          // Prevent pre-hijacked local-email accounts retaining an attacker's provider link.
          if (!user.emailVerifiedAt) {
            if (
              grant.emailTrusted &&
              grant.email === user.email.toLowerCase()
            ) {
              await tx.user.update({
                where: { id: user.id },
                data: { emailVerifiedAt: new Date() },
              });
            } else {
              return { needsVerification: user.id };
            }
          }
          if (!identity) {
            await tx.socialIdentity.create({
              data: {
                provider: grant.provider,
                providerAccountId: grant.providerAccountId,
                userId: user.id,
              },
            });
          }
          const verified = await tx.user.findUniqueOrThrow({
            where: { id: user.id },
          });
          return {
            tokens: await this.auth.createSessionForUser(verified, context, tx),
          };
        }
        if (identity) {
          const user = identity.user;
          if (
            user.deletedAt ||
            (user.status !== UserStatus.ACTIVE &&
              user.status !== UserStatus.PENDING_VERIFICATION)
          ) {
            this.fail('account_unavailable');
          }
          if (user.status === UserStatus.PENDING_VERIFICATION) {
            return { needsVerification: user.id };
          }
          return {
            tokens: await this.auth.createSessionForUser(user, context, tx),
          };
        }
        if (!grant.email) {
          this.fail('email_unavailable');
        }
        const existing = await tx.user.findUnique({
          where: { email: grant.email },
        });
        if (existing) {
          this.fail('account_exists');
        }
        const passwordHash = await argon2.hash(
          randomBytes(48).toString('base64url'),
          { type: argon2.argon2id },
        );
        const user = await tx.user.create({
          data: {
            email: grant.email,
            passwordHash,
            displayName: grant.displayName,
            status: grant.emailTrusted
              ? UserStatus.ACTIVE
              : UserStatus.PENDING_VERIFICATION,
            emailVerifiedAt: grant.emailTrusted ? new Date() : null,
          },
        });
        await tx.socialIdentity.create({
          data: {
            userId: user.id,
            provider: grant.provider,
            providerAccountId: grant.providerAccountId,
          },
        });
        if (!grant.emailTrusted) {
          return { needsVerification: user.id };
        }
        return {
          tokens: await this.auth.createSessionForUser(user, context, tx),
        };
      });
      if ('needsVerification' in result && result.needsVerification) {
        try {
          await this.auth.sendSocialVerification(result.needsVerification);
        } catch {
          this.fail('provider_error');
        }
        this.fail('email_verification_required');
      }
      if (!('tokens' in result) || !result.tokens) {
        this.fail('provider_error');
      }
      return result.tokens;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.fail('identity_in_use');
      }
      throw error;
    }
  }
  async cleanup() {
    const now = new Date();
    const [attempts, grants] = await this.prisma.$transaction([
      this.prisma.socialAuthAttempt.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.socialAuthGrant.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);
    return { attempts: attempts.count, grants: grants.count };
  }
}
