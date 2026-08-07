import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AccessPrincipal } from '../common/auth.types';
import { response } from '../common/api-response';
import { CurrentUser } from '../common/decorators';
import {
  CreateLandDto,
  ListLandsDto,
  SaveLandDto,
  UpdateLandDto,
} from './lands.dto';
import { LandsService } from './lands.service';

@ApiTags('lands')
@ApiBearerAuth()
@Controller('api/v1/lands')
export class LandsController {
  constructor(private readonly lands: LandsService) {}

  @Post()
  async create(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: CreateLandDto,
  ) {
    return response(await this.lands.create(user.userId, dto));
  }

  @Get()
  async list(
    @CurrentUser() user: AccessPrincipal,
    @Query() query: ListLandsDto,
  ) {
    const result = await this.lands.list(user.userId, query);
    return response(result.items, result.pagination);
  }

  @Get(':id')
  async one(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.lands.get(user.userId, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLandDto,
  ) {
    return response(await this.lands.update(user.userId, id, dto));
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.lands.remove(user.userId, id));
  }

  @Post(':id/revisions')
  async save(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveLandDto,
  ) {
    return response(await this.lands.save(user.userId, id, dto.canvas));
  }

  @Get(':id/revisions')
  async revisions(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.lands.revisions(user.userId, id));
  }

  @Post(':id/revisions/:revision/restore')
  async restore(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revision') revision: string,
  ) {
    return response(
      await this.lands.restore(user.userId, id, Number(revision)),
    );
  }

  @Get(':id/canvas')
  async canvas(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const result = await this.lands.canvas(user.userId, id);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      ETag: `"${result.revision.contentHash}"`,
      'Cache-Control': 'private, no-cache',
    });
    result.object.stream.pipe(res);
  }

  @Get(':id/revisions/:revision/canvas')
  async revisionCanvas(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revision') revision: string,
    @Res() res: Response,
  ) {
    const result = await this.lands.canvas(user.userId, id, Number(revision));
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      ETag: `"${result.revision.contentHash}"`,
    });
    result.object.stream.pipe(res);
  }
}
