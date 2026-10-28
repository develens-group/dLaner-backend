import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionClientType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

const config = new ConfigService({
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '30d',
});

const jwt = {
  verifyAsync: jest.fn(),
  signAsync: jest.fn(async (payload: { type: string }) => `${payload.type}-token`),
};

describe('AuthService refresh rotation', () => {
  let currentToken: string;
  let previousToken: string;
  let currentHash: string;
  let previousHash: string;
  let tx: {
    session: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: AuthService;

  const session = () => ({
    id: 'session-1',
    userId: 'user-1',
    clientType: SessionClientType.WEB,
    refreshTokenHash: currentHash,
    prevRefreshTokenHash: previousHash,
    prevRefreshTokenAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    wordpressSite: null,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      plan: 'FREE',
      status: UserStatus.ACTIVE,
    },
  });

  beforeAll(async () => {
    currentToken = 'current-refresh-token';
    previousToken = 'previous-refresh-token';
    currentHash = await argon2.hash(currentToken);
    previousHash = await argon2.hash(previousToken);
  });

  beforeEach(() => {
    tx = {
      session: {
        findUnique: jest.fn().mockResolvedValue(session()),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new AuthService(
      { $transaction: (fn: (client: unknown) => unknown) => fn(tx) } as never,
      jwt as never,
      config,
      {} as never,
    );
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sid: 'session-1',
      type: 'refresh',
    });
  });

  it('rotates the token and slides the expiry for the current token', async () => {
    const result = await service.refresh(currentToken);

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prevRefreshTokenHash: currentHash,
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.session.update).not.toHaveBeenCalled();
  });

  it('accepts the previous token inside the grace window without revoking', async () => {
    const result = await service.refresh(previousToken);

    // Body transport: access token only, the rotated token stays untouched.
    expect(result).toEqual({ accessToken: 'access-token' });
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastUsedAt: expect.any(Date), expiresAt: expect.any(Date) },
    });
  });

  it('still revokes the session for a stale token outside the grace window', async () => {
    tx.session.findUnique.mockResolvedValue({
      ...session(),
      prevRefreshTokenAt: new Date(Date.now() - 5 * 60_000),
    });

    await expect(service.refresh(previousToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
