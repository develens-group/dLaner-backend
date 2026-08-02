import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Public, Roles } from '../common/decorators';
import {
  CreateTemplateDto,
  CreateVersionDto,
  EventDto,
  ListTemplatesDto,
  ReviewDto,
  ShareDto,
  UpdateTemplateDto,
} from './templates.dto';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('api/v1/templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}
  @Post() create(
    @CurrentUser() u: AccessPrincipal,
    @Body() d: CreateTemplateDto,
  ) {
    return this.wrap(this.service.create(u.userId, d));
  }
  @Get('mine') mine(
    @CurrentUser() u: AccessPrincipal,
    @Query() q: ListTemplatesDto,
  ) {
    return this.wrap(this.service.mine(u.userId, q));
  }
  @Get(':id/manage') manage(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wrap(this.service.owned(u.userId, id));
  }
  @Patch(':id') update(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateTemplateDto,
  ) {
    return this.wrap(this.service.update(u.userId, id, d));
  }
  @Delete(':id') remove(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wrap(this.service.remove(u.userId, id));
  }
  @Post(':id/versions')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  version(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateVersionDto,
  ) {
    return this.wrap(this.service.createVersion(u.userId, id, d));
  }
  @Get(':id/versions') versions(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wrap(this.service.versions(u.userId, id));
  }
  @Get(':id/versions/:versionId') versionOne(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) vid: string,
  ) {
    return this.wrap(this.service.version(u.userId, id, vid));
  }
  @Post(':id/submit') @HttpCode(200) submit(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wrap(this.service.submit(u.userId, id));
  }
  @Post(':id/archive') @HttpCode(200) archive(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wrap(this.service.lifecycle(u.userId, id, true));
  }
  @Post(':id/restore') @HttpCode(200) restore(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wrap(this.service.lifecycle(u.userId, id, false));
  }
  @Post(':id/share-links') createShare(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ShareDto,
  ) {
    return this.wrap(this.service.createShare(u.userId, id, d));
  }
  @Delete(':id/share-links/:shareId') revoke(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shareId', ParseUUIDPipe) sid: string,
  ) {
    return this.wrap(this.service.revokeShare(u.userId, id, sid));
  }
  @Post(':id/events')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  event(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: EventDto,
    @Req() req: Request,
  ) {
    return this.wrap(this.service.event(id, d.type, undefined, req.ip));
  }
  private async wrap<T>(p: Promise<T>) {
    return response(await p);
  }
}

@ApiTags('public-templates')
@Controller('api/v1/public/templates')
export class PublicTemplatesController {
  constructor(private readonly service: TemplatesService) {}
  @Public() @Get() async list(@Query() q: ListTemplatesDto) {
    const x = await this.service.publicList(q);
    return response(x.items, x.pagination);
  }
  @Public() @Get(':slug') async one(@Param('slug') slug: string) {
    return response(await this.service.publicOne(slug));
  }
  @Public()
  @Get(':slug/download')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async download(@Param('slug') slug: string, @Res() res: Response) {
    const x = await this.service.download(slug);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${x.filename}"`,
      ETag: `"${x.hash}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    x.object.stream.pipe(res);
  }
  @Public() @Get(':slug/versions/:version/download') async version(
    @Param('slug') slug: string,
    @Param('version') v: string,
    @Res() res: Response,
  ) {
    const x = await this.service.download(slug, Number(v));
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${x.filename}"`,
      ETag: `"${x.hash}"`,
    });
    x.object.stream.pipe(res);
  }
}
@ApiTags('template-shares')
@Controller('api/v1/template-shares')
export class TemplateSharesController {
  constructor(private readonly s: TemplatesService) {}
  @Public() @Get(':token') async get(@Param('token') token: string) {
    return response(await this.s.shared(token));
  }
}
@ApiTags('template-categories')
@Controller('api/v1/template-categories')
export class TemplateCategoriesController {
  constructor(private readonly s: TemplatesService) {}
  @Public() @Get() async get() {
    return response(await this.s.categories());
  }
}
@ApiTags('admin-templates')
@ApiBearerAuth()
@Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/templates')
export class AdminTemplatesController {
  constructor(private readonly s: TemplatesService) {}
  @Get('review-queue') async queue(@Query() q: ListTemplatesDto) {
    return response(await this.s.reviewQueue(q));
  }
  @Post(':id/approve') approve(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReviewDto,
  ) {
    return this.go(u, id, 'APPROVED', d.comment);
  }
  @Post(':id/reject') reject(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReviewDto,
  ) {
    return this.go(u, id, 'REJECTED', d.comment);
  }
  @Post(':id/request-changes') changes(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReviewDto,
  ) {
    return this.go(u, id, 'CHANGES_REQUESTED', d.comment);
  }
  @Post(':id/unpublish') async unpublish(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.s.unpublish(u.userId, id));
  }
  private async go(
    u: AccessPrincipal,
    id: string,
    a: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
    c?: string,
  ) {
    return response(await this.s.review(u.userId, u.role, id, a, c));
  }
}
