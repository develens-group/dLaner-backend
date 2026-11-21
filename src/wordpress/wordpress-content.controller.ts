import {
  Body,
  Delete,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  Header,
} from '@nestjs/common';
import {
  IsObject,
  IsInt,
  IsOptional,
  IsIn,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Public, CurrentUser } from '../common/decorators';
import type { AccessPrincipal } from '../common/auth.types';
import { response } from '../common/api-response';
import {
  WordPressInstallationGuard,
  type RequestWithWordPressSite,
} from './wordpress-installation.guard';
import { WordPressContentService } from './wordpress-content.service';
export class ContentBodyDto {
  @IsObject() payload!: Record<string, unknown>;
}
export class ContentListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional()
  @IsIn(['page', 'post', 'product', 'media', 'menu', 'taxonomy', 'appearance'])
  kind?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}
@Controller('api/v1')
export class WordPressContentController {
  constructor(private readonly content: WordPressContentService) {}
  private web(user: AccessPrincipal) {
    if (user.client !== 'web')
      throw new ForbiddenException('Use your dLander web account.');
  }
  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Post('wordpress/content-sync')
  async start(
    @Req() req: RequestWithWordPressSite,
    @Body() dto: ContentBodyDto,
  ) {
    return response(await this.content.start(req.wordpressSite!, dto.payload));
  }
  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Post('wordpress/content-sync/:id/items')
  async batch(
    @Req() req: RequestWithWordPressSite,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContentBodyDto,
  ) {
    return response(
      await this.content.batch(req.wordpressSite!, id, dto.payload),
    );
  }
  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Post('wordpress/content-sync/:id/complete')
  async complete(
    @Req() req: RequestWithWordPressSite,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.content.complete(req.wordpressSite!, id));
  }
  @Post('users/me/wordpress-sites/:siteId/content-sync')
  async startWeb(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: ContentBodyDto,
  ) {
    this.web(user);
    return response(
      await this.content.startForWeb(user.userId, siteId, dto.payload),
    );
  }
  @Post('users/me/wordpress-sites/:siteId/content-sync/:id/items')
  async batchWeb(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContentBodyDto,
  ) {
    this.web(user);
    return response(
      await this.content.batchForWeb(user.userId, siteId, id, dto.payload),
    );
  }
  @Post('users/me/wordpress-sites/:siteId/content-sync/:id/complete')
  async completeWeb(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.web(user);
    return response(await this.content.completeForWeb(user.userId, siteId, id));
  }
  @Delete('users/me/wordpress-sites/:siteId/content-sync/:id')
  async abortWeb(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.web(user);
    return response(await this.content.abortForWeb(user.userId, siteId, id));
  }
  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Delete('wordpress/content-sync/:id')
  async abortPlugin(
    @Req() req: RequestWithWordPressSite,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.content.abort(req.wordpressSite!, id));
  }
  @Get('users/me/wordpress-sites/:siteId/content')
  @Header('Cache-Control', 'no-store')
  async summary(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    this.web(user);
    return response(await this.content.summary(user.userId, siteId));
  }
  @Get('users/me/wordpress-sites/:siteId/content/items')
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: ContentListDto,
  ) {
    this.web(user);
    return response(await this.content.list(user.userId, siteId, query));
  }
  @Get('users/me/wordpress-sites/:siteId/content/items/:id')
  @Header('Cache-Control', 'no-store')
  async item(
    @CurrentUser() user: AccessPrincipal,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.web(user);
    return response(await this.content.item(user.userId, siteId, id));
  }
}
