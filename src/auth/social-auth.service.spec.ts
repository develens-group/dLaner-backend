import { ConfigService } from '@nestjs/config';
import { SessionClientType, UserStatus } from '@prisma/client';
import { hashOpaqueToken } from '../common/security';
import { SocialAuthService } from './social-auth.service';
import { socialHash } from './social-auth.providers';

const verifier = 'v'.repeat(43);
const code = 'c'.repeat(43);
const user = (extra: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  status: UserStatus.ACTIVE,
  deletedAt: null,
  emailVerifiedAt: new Date(),
  ...extra,
});

describe('Social authorization state and account ownership', () => {
  let prisma: {
    socialAuthAttempt: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    socialAuthGrant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    socialIdentity: { findUnique: jest.Mock; create: jest.Mock };
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    session: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let providers: Record<string, jest.Mock>;
  let auth: Record<string, jest.Mock>;
  let service: SocialAuthService;
  const grant = (extra = {}) => ({
    id: 'grant-1',
    provider: 'github',
    providerAccountId: 'subject-1',
    email: 'user@example.com',
    emailTrusted: true,
    displayName: 'Designer',
    codeChallenge: socialHash(verifier),
    codeHash: hashOpaqueToken(code),
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    linkUserId: null,
    linkSessionId: null,
    ...extra,
  });
  const setGrant = (extra = {}) => {
    prisma.socialAuthGrant.findUnique.mockResolvedValue(grant(extra));
  };
  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      socialAuthAttempt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      socialAuthGrant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      socialIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          ...user(),
          ...data,
        })),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(user()),
      },
      session: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          clientType: SessionClientType.WEB,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: user(),
        }),
      },
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    providers = {
      configured: jest.fn().mockReturnValue(true),
      list: jest.fn().mockReturnValue(['github']),
      authorizationUrl: jest
        .fn()
        .mockReturnValue('https://github.com/login/oauth/authorize'),
      profileForCode: jest.fn().mockResolvedValue({
        subject: 'subject-1',
        email: 'user@example.com',
        emailTrusted: true,
        displayName: 'Designer',
      }),
    };
    auth = {
      createSessionForUser: jest.fn().mockResolvedValue({
        accessToken: 'app-access',
        refreshToken: 'app-refresh',
        user: user(),
      }),
      sendSocialVerification: jest.fn(),
    };
    service = new SocialAuthService(
      prisma as never,
      providers as never,
      auth as never,
      new ConfigService({ FRONTEND_URL: 'https://dlander.example' }),
    );
  });
  it('stores only a hash of the random provider state and binds explicit links to a session', async () => {
    await service.start(
      'github',
      { codeChallenge: socialHash(verifier), clientState: 's'.repeat(43) },
      { userId: 'user-1', sessionId: 'session-1' },
    );
    const data = (
      prisma.socialAuthAttempt.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ]
    )[0].data;
    const rawState = (
      providers.authorizationUrl.mock.calls[0] as [string, string]
    )[1];
    expect(data.stateHash).toBe(hashOpaqueToken(rawState));
    expect(data.stateHash).not.toBe(rawState);
    expect(data).toMatchObject({
      linkUserId: 'user-1',
      linkSessionId: 'session-1',
    });
  });
  it('rejects provider mix-up before contacting the provider', async () => {
    prisma.socialAuthAttempt.findUnique.mockResolvedValue({
      provider: 'google',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const url = new URL(
      await service.callback('github', {
        state: 's'.repeat(43),
        code: 'provider-code',
      }),
    );
    expect(new URLSearchParams(url.hash.slice(1)).get('error')).toBe(
      'invalid_state',
    );
    expect(providers.profileForCode).not.toHaveBeenCalled();
  });
  it('creates a short-lived candidate grant without mutating accounts on provider callback', async () => {
    prisma.socialAuthAttempt.findUnique.mockResolvedValue({
      id: 'attempt',
      provider: 'github',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      clientState: 'client-state',
      codeChallenge: socialHash(verifier),
      providerVerifier: 'server-verifier',
      linkUserId: null,
      linkSessionId: null,
    });
    const url = new URL(
      await service.callback('github', {
        state: 's'.repeat(43),
        code: 'provider-code',
      }),
    );
    const fragment = new URLSearchParams(url.hash.slice(1));
    expect(url.origin + url.pathname).toBe(
      'https://dlander.example/auth/social/callback',
    );
    expect(fragment.get('state')).toBe('client-state');
    expect(fragment.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.toString()).not.toMatch(
      /accessToken|refreshToken|provider-code/,
    );
    expect(
      (
        prisma.socialAuthGrant.create.mock.calls[0] as [
          { data: { codeHash: string } },
        ]
      )[0].data.codeHash,
    ).toBe(hashOpaqueToken(fragment.get('code')!));
    expect(prisma.socialIdentity.create).not.toHaveBeenCalled();
    expect(auth.createSessionForUser).not.toHaveBeenCalled();
  });
  it('rejects callback state replay atomically', async () => {
    prisma.socialAuthAttempt.findUnique.mockResolvedValue({
      id: 'attempt',
      provider: 'github',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.socialAuthAttempt.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await service.callback('github', {
        state: 's'.repeat(43),
        code: 'provider-code',
      }),
    ).toContain('error=invalid_state');
    expect(providers.profileForCode).not.toHaveBeenCalled();
  });
  it('rejects a verifier mismatch without consuming the grant or creating a session', async () => {
    setGrant();
    await expect(
      service.exchange({ code, codeVerifier: 'wrong'.repeat(10) }, {}),
    ).rejects.toMatchObject({ response: { code: 'invalid_state' } });
    expect(prisma.socialAuthGrant.updateMany).not.toHaveBeenCalled();
    expect(auth.createSessionForUser).not.toHaveBeenCalled();
  });
  it('rejects expired and already-consumed grants', async () => {
    setGrant({ expiresAt: new Date(Date.now() - 1) });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({ response: { code: 'invalid_state' } });
    setGrant();
    prisma.socialAuthGrant.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({ response: { code: 'invalid_state' } });
  });
  it('refuses to merge an existing same-email account', async () => {
    setGrant();
    prisma.user.findUnique.mockResolvedValue(user());
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({ response: { code: 'account_exists' } });
    expect(prisma.socialIdentity.create).not.toHaveBeenCalled();
    expect(auth.createSessionForUser).not.toHaveBeenCalled();
  });
  it('creates a new trusted social user with no caller-supplied role or password', async () => {
    setGrant();
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).resolves.toMatchObject({ accessToken: 'app-access' });
    const data = (
      prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data).toMatchObject({
      status: UserStatus.ACTIVE,
      email: 'user@example.com',
    });
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.role).toBeUndefined();
    expect(data.plan).toBeUndefined();
  });
  it('requires OTP for new Facebook email and issues no auth tokens', async () => {
    setGrant({ provider: 'facebook', emailTrusted: false });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({
      response: { code: 'email_verification_required' },
    });
    expect(
      (
        prisma.user.create.mock.calls[0] as [{ data: { status: UserStatus } }]
      )[0].data.status,
    ).toBe(UserStatus.PENDING_VERIFICATION);
    expect(auth.sendSocialVerification).toHaveBeenCalledWith('user-1');
    expect(auth.createSessionForUser).not.toHaveBeenCalled();
  });
  it('does not issue tokens for blocked linked identities', async () => {
    setGrant();
    prisma.socialIdentity.findUnique.mockResolvedValue({
      userId: 'user-1',
      user: user({ status: UserStatus.BLOCKED }),
    });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({ response: { code: 'account_unavailable' } });
    expect(auth.createSessionForUser).not.toHaveBeenCalled();
  });
  it('revalidates the initiating link session and rejects revoked or WordPress sessions', async () => {
    setGrant({ linkUserId: 'user-1', linkSessionId: 'session-1' });
    prisma.session.findUnique.mockResolvedValue({
      userId: 'user-1',
      clientType: SessionClientType.WORDPRESS,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: user(),
    });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({ response: { code: 'account_unavailable' } });
    expect(prisma.socialIdentity.create).not.toHaveBeenCalled();
  });
  it('cannot link a provider identity owned by someone else', async () => {
    setGrant({ linkUserId: 'user-1', linkSessionId: 'session-1' });
    prisma.socialIdentity.findUnique.mockResolvedValue({
      userId: 'another-user',
    });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({ response: { code: 'identity_in_use' } });
  });
  it('requires proof of the local mailbox before attaching a different-email provider', async () => {
    setGrant({
      linkUserId: 'user-1',
      linkSessionId: 'session-1',
      email: 'different@example.com',
    });
    prisma.session.findUnique.mockResolvedValue({
      userId: 'user-1',
      clientType: SessionClientType.WEB,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: user({ emailVerifiedAt: null }),
    });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).rejects.toMatchObject({
      response: { code: 'email_verification_required' },
    });
    expect(prisma.socialIdentity.create).not.toHaveBeenCalled();
    expect(auth.sendSocialVerification).toHaveBeenCalledWith('user-1');
  });
  it('links explicitly after both accounts have been proven', async () => {
    setGrant({ linkUserId: 'user-1', linkSessionId: 'session-1' });
    await expect(
      service.exchange({ code, codeVerifier: verifier }, {}),
    ).resolves.toMatchObject({ accessToken: 'app-access' });
    expect(prisma.socialIdentity.create).toHaveBeenCalledWith({
      data: {
        provider: 'github',
        providerAccountId: 'subject-1',
        userId: 'user-1',
      },
    });
  });
});
