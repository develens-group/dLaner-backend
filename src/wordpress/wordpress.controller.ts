import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import {
  CreateWordPressSiteDto,
  UpdateWordPressSiteDto,
} from './wordpress.dto';
import { WordPressService } from './wordpress.service';

@ApiTags('wordpress')
@ApiBearerAuth()
@Controller('api/v1/users/me/wordpress-sites')
export class WordPressController {
  constructor(private readonly wordpress: WordPressService) {}

  @Get()
  async list(@CurrentUser() user: AccessPrincipal) {
    this.assertWebClient(user);
    return response(await this.wordpress.list(user.userId));
  }

  @Post()
  async create(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: CreateWordPressSiteDto,
  ) {
    this.assertWebClient(user);
    return response(await this.wordpress.create(user.userId, dto));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWordPressSiteDto,
  ) {
    this.assertWebClient(user);
    return response(await this.wordpress.update(user.userId, id, dto));
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertWebClient(user);
    return response(await this.wordpress.remove(user.userId, id));
  }

  @Post(':id/rotate-key')
  async rotateKey(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertWebClient(user);
    return response(await this.wordpress.rotateKey(user.userId, id));
  }

  private assertWebClient(user: AccessPrincipal) {
    if (user.client !== 'web')
      throw new ForbiddenException(
        'WordPress site settings can only be changed from the web app',
      );
  }
}
