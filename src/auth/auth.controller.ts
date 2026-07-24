import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { response } from '../common/api-response';
import { CurrentSession, CurrentUser, Public } from '../common/decorators';
import { durationMs } from '../common/duration';
import { getClientContext } from '../common/request-context';
import type { AccessPrincipal } from '../common/auth.types';
import {
  ChangePasswordDto,
  EmailDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    return response(await this.auth.register(dto));
  }

  @Public()
  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(@Body() dto: TokenDto) {
    return response(await this.auth.verifyEmail(dto.token));
  }

  @Public()
  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resend(@Body() dto: EmailDto) {
    return response(await this.auth.resendVerification(dto.email));
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, getClientContext(req));
    return response(this.transportTokens(result, res));
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = this.isCookie() ? this.readCookie(req) : dto.refreshToken;
    if (!raw) throw new UnauthorizedException('Refresh token is required');
    return response(this.transportTokens(await this.auth.refresh(raw), res));
  }

  @ApiBearerAuth()
  @Post('logout')
  async logout(
    @CurrentSession() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearCookie(res);
    return response(await this.auth.logout(sessionId));
  }
  @ApiBearerAuth()
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AccessPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearCookie(res);
    return response(await this.auth.logoutAll(user.userId));
  }
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgot(@Body() dto: EmailDto) {
    return response(await this.auth.forgotPassword(dto.email));
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async reset(@Body() dto: ResetPasswordDto) {
    return response(await this.auth.resetPassword(dto));
  }

  @ApiBearerAuth()
  @Post('change-password')
  async change(
    @CurrentUser() user: AccessPrincipal,
    @CurrentSession() sessionId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return response(
      await this.auth.changePassword(user.userId, sessionId, dto),
    );
  }

  private transportTokens<
    T extends { accessToken: string; refreshToken: string },
  >(result: T, res: Response) {
    if (!this.isCookie()) return result;
    res.cookie(this.cookieName(), result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: durationMs(
        this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
      ),
    });
    const { refreshToken, ...safe } = result;
    void refreshToken;
    return safe;
  }
  private clearCookie(res: Response) {
    if (this.isCookie())
      res.clearCookie(this.cookieName(), {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
      });
  }
  private isCookie() {
    return this.config.get('AUTH_REFRESH_TOKEN_TRANSPORT', 'body') === 'cookie';
  }
  private cookieName() {
    return this.config.get<string>('AUTH_REFRESH_COOKIE_NAME', 'refresh_token');
  }
  private readCookie(req: Request): string | undefined {
    const cookies: unknown = req.cookies;
    if (!cookies || typeof cookies !== 'object') return undefined;
    const value = (cookies as Record<string, unknown>)[this.cookieName()];
    return typeof value === 'string' ? value : undefined;
  }
}
