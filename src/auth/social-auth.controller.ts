import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentSession, CurrentUser, Public } from '../common/decorators';
import { response } from '../common/api-response';
import { getClientContext } from '../common/request-context';
import { transportAuthTokens } from './auth-token-transport';
import { SocialExchangeDto, SocialStartDto } from './social-auth.dto';
import { SocialAuthService } from './social-auth.service';

@ApiTags('auth')
@Controller('api/v1/auth/social')
export class SocialAuthController {
  constructor(
    private readonly social: SocialAuthService,
    private readonly config: ConfigService,
  ) {}
  @Public()
  @Get('providers')
  @Header('Cache-Control', 'no-store')
  providers() {
    return response(this.social.list());
  }

  @Public()
  @Post(':provider/start')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async start(
    @Param('provider') provider: string,
    @Body() dto: SocialStartDto,
  ) {
    return response(await this.social.start(provider, dto));
  }

  @ApiBearerAuth()
  @Post(':provider/link')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async link(
    @Param('provider') provider: string,
    @Body() dto: SocialStartDto,
    @CurrentUser() user: AccessPrincipal,
    @CurrentSession() sessionId: string,
  ) {
    return response(
      await this.social.start(provider, dto, {
        userId: user.userId,
        sessionId,
      }),
    );
  }

  @Public()
  @Get(':provider/callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(
    @Param('provider') provider: string,
    @Query('state') state: unknown,
    @Query('code') code: unknown,
    @Query('error') error: unknown,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(
      303,
      await this.social.callback(provider, { state, code, error }),
    );
  }

  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async exchange(
    @Body() dto: SocialExchangeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return response(
      transportAuthTokens(
        await this.social.exchange(dto, getClientContext(req)),
        res,
        this.config,
      ),
    );
  }
}
