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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import { AuditService } from '../audit/audit.service';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Public, Roles } from '../common/decorators';
import {
  BulkCreateTemplatesDto,
  CreateTemplateDto,
  CreateTemplateCategoryDto,
  CreateVersionDto,
  AdminTemplateQueryDto,
  EventDto,
  ListTemplatesDto,
  ReviewDto,
  ShareDto,
  UpdateTemplateDto,
  UpdateTemplateCategoryDto,
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
  @Post('bulk')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  bulk(
    @CurrentUser() u: AccessPrincipal,
    @Body() d: BulkCreateTemplatesDto,
  ) {
    return this.wrap(this.service.createBulk(u.userId, d));
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
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['library'],
      properties: {
        library: {
          oneOf: [
            { type: 'string', description: 'JSON string (multipart)' },
            { type: 'object', description: 'Library object (JSON body)' },
          ],
        },
        changelog: { type: 'string' },
        previewImageBase64: {
          type: 'string',
          description: 'Optional JPEG/PNG as raw base64 (JSON body)',
        },
        previewImageType: {
          type: 'string',
          enum: ['image/jpeg', 'image/jpg', 'image/png'],
          example: 'image/png',
        },
        previewImage: {
          type: 'string',
          format: 'binary',
          description: 'Optional JPEG/PNG file (multipart)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('previewImage', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  version(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateVersionDto,
    @UploadedFile() previewImage?: Express.Multer.File,
  ) {
    return this.wrap(
      this.service.createVersion(u.userId, id, d, previewImage),
    );
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
@ApiTags('template-objects')
@Controller('api/v1/template-objects')
export class TemplateObjectsController {
  constructor(private readonly service: TemplatesService) {}

  @Public()
  @Get('templates/:templateId/versions/:versionId/:filename')
  async get(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const key = `templates/${templateId}/versions/${versionId}/${filename}`;
    const object = await this.service.streamPublicObject(key);
    const lower = filename.toLowerCase();
    res.set({
      'Content-Type': lower.endsWith('.png') ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    object.stream.pipe(res);
  }
}
@ApiTags('admin-templates')
@ApiBearerAuth()
@Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/templates')
export class AdminTemplatesController {
  constructor(
    private readonly s: TemplatesService,
    private readonly audit: AuditService,
  ) {}
  @Get() async all(@Query() q: AdminTemplateQueryDto) {
    const x = await this.s.adminList(q);
    return response(x.items, x.pagination);
  }
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
    const result = await this.s.unpublish(u.userId, id);
    this.audit.record('template.unpublished', u.userId, id, 'Template');
    return response(result);
  }
  @Post(':id/archive')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async archive(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.s.adminLifecycle(id, true);
    this.audit.record('template.archived_by_admin', u.userId, id, 'Template');
    return response(result);
  }
  @Post(':id/restore')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async restore(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.s.adminLifecycle(id, false);
    this.audit.record('template.restored_by_admin', u.userId, id, 'Template');
    return response(result);
  }
  @Delete(':id') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) async remove(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.s.adminRemove(id);
    this.audit.record('template.deleted_by_admin', u.userId, id, 'Template');
    return response(result);
  }
  private async go(
    u: AccessPrincipal,
    id: string,
    a: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
    c?: string,
  ) {
    const result = await this.s.review(u.userId, u.role, id, a, c);
    this.audit.record(
      `template.${a.toLowerCase()}`,
      u.userId,
      id,
      'Template',
      c ? { comment: c } : undefined,
    );
    return response(result);
  }
}

@ApiTags('admin-template-categories')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/template-categories')
export class AdminTemplateCategoriesController {
  constructor(
    private readonly s: TemplatesService,
    private readonly audit: AuditService,
  ) {}
  @Get() async list() {
    return response(await this.s.adminCategories());
  }
  @Post() async create(
    @CurrentUser() u: AccessPrincipal,
    @Body() dto: CreateTemplateCategoryDto,
  ) {
    const item = await this.s.createCategory(dto);
    this.audit.record(
      'template_category.created',
      u.userId,
      item.id,
      'TemplateCategory',
    );
    return response(item);
  }
  @Patch(':id') async update(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateCategoryDto,
  ) {
    const item = await this.s.updateCategory(id, dto);
    this.audit.record(
      'template_category.updated',
      u.userId,
      id,
      'TemplateCategory',
    );
    return response(item);
  }
  @Delete(':id') async remove(
    @CurrentUser() u: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.s.deleteCategory(id);
    this.audit.record(
      'template_category.deleted',
      u.userId,
      id,
      'TemplateCategory',
    );
    return response(item);
  }
}
