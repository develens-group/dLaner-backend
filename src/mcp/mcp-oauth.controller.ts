import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsUUID,
} from 'class-validator';
import type { Response } from 'express';
import { OAuthError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { response } from '../common/api-response';
import { MCP_ACCOUNT_SCOPES, McpOAuthService } from './mcp-oauth.service';

export class McpConsentDecisionDto {
  @IsBoolean() approved!: boolean;
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(MCP_ACCOUNT_SCOPES, { each: true })
  scopes!: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  siteIds!: string[];
}

@Controller('api/v1/mcp/oauth')
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  private web(user: AccessPrincipal) {
    if (user.client !== 'web')
      throw new ForbiddenException(
        'Use your dLander web account to manage assistant connections',
      );
  }

  private async oauthResult<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OAuthError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('requests/:token')
  async consent(
    @CurrentUser() user: AccessPrincipal,
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.web(user);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return response(
      await this.oauthResult(() => this.oauth.consentInfo(token, user.userId)),
    );
  }

  @Post('requests/:token')
  async decide(
    @CurrentUser() user: AccessPrincipal,
    @Param('token') token: string,
    @Body() dto: McpConsentDecisionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.web(user);
    // Bearer authorization is required by the global guard; cookies alone never approve a grant.
    res.setHeader('Cache-Control', 'no-store');
    return response(
      await this.oauthResult(() =>
        this.oauth.decide(
          token,
          user.userId,
          dto.approved,
          dto.scopes,
          dto.siteIds,
        ),
      ),
    );
  }

  @Get('connections')
  async connections(
    @CurrentUser() user: AccessPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.web(user);
    res.setHeader('Cache-Control', 'no-store');
    return response(await this.oauth.connections(user.userId));
  }

  @Delete('connections/:id')
  async revoke(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.web(user);
    return response(await this.oauth.revokeConnection(user.userId, id));
  }
}
