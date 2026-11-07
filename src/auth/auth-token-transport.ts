import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { durationMs } from '../common/duration';

export function transportAuthTokens<
  T extends { accessToken: string; refreshToken?: string },
>(result: T, res: Response, config: ConfigService) {
  if (
    config.get('AUTH_REFRESH_TOKEN_TRANSPORT', 'body') !== 'cookie' ||
    !result.refreshToken
  ) {
    return result;
  }
  res.cookie(
    config.get<string>('AUTH_REFRESH_COOKIE_NAME', 'refresh_token'),
    result.refreshToken,
    {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: durationMs(config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN')),
    },
  );
  const { refreshToken, ...safe } = result;
  void refreshToken;
  return safe;
}
