import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { AiGalleryService } from './ai-gallery.service';

class GalleryQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@ApiTags('ai-gallery')
@ApiBearerAuth()
@Controller('api/v1/ai/gallery')
export class AiGalleryController {
  constructor(private readonly gallery: AiGalleryService) {}

  @Get()
  async list(
    @CurrentUser() user: AccessPrincipal,
    @Query() query: GalleryQueryDto,
  ) {
    const result = await this.gallery.list(user.userId, {
      cursor: query.cursor,
      limit: query.limit,
    });
    return response(result.items, { nextCursor: result.nextCursor });
  }

  @Get(':requestId')
  async get(
    @CurrentUser() user: AccessPrincipal,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return response(await this.gallery.get(user.userId, requestId));
  }
}
