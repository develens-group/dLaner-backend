import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Public } from '../common/decorators';
import { EditSessionService } from './edit-session.service';
import {
  WordPressInstallationGuard,
  WordPressOrWebGuard,
} from './wordpress-installation.guard';
import type { RequestWithWordPressSite } from './wordpress-installation.guard';
import {
  CompleteEditSessionDto,
  CreateEditSessionDto,
} from './wordpress.dto';

@ApiTags('wordpress-edit')
@Controller('api/v1/wordpress/edit-sessions')
export class EditSessionController {
  constructor(private readonly edits: EditSessionService) {}

  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'X-Dlander-Installation-Key', required: true })
  @ApiHeader({ name: 'X-Dlander-Site-Url', required: true })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(
    @Req() req: RequestWithWordPressSite,
    @Body() dto: CreateEditSessionDto,
  ) {
    return response(await this.edits.create(req.wordpressSite!, dto));
  }

  @Public()
  @UseGuards(WordPressOrWebGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Dlander-Installation-Key', required: false })
  @ApiHeader({ name: 'X-Dlander-Site-Url', required: false })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithWordPressSite,
  ) {
    return response(
      await this.edits.getDual(id, {
        userId: req.user?.userId,
        site: req.wordpressSite,
      }),
    );
  }

  @ApiBearerAuth()
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: CompleteEditSessionDto,
  ) {
    if (user.client !== 'web')
      throw new ForbiddenException(
        'Only web sessions can complete edit sessions',
      );
    return response(await this.edits.complete(id, user.userId, dto));
  }

  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Get(':id/result')
  @ApiHeader({ name: 'X-Dlander-Installation-Key', required: true })
  @ApiHeader({ name: 'X-Dlander-Site-Url', required: true })
  async result(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithWordPressSite,
  ) {
    return response(await this.edits.result(id, req.wordpressSite!));
  }

  @Public()
  @UseGuards(WordPressInstallationGuard)
  @Post(':id/assets')
  @ApiHeader({ name: 'X-Dlander-Installation-Key', required: true })
  @ApiHeader({ name: 'X-Dlander-Site-Url', required: true })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        direction: { type: 'string', enum: ['input', 'output'] },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async uploadAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithWordPressSite,
    @UploadedFile() file: Express.Multer.File,
    @Body('direction') direction?: 'input' | 'output',
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'UNSUPPORTED_MEDIA',
        message: 'File is required',
      });
    return response(
      await this.edits.addAsset(
        id,
        req.wordpressSite!,
        file,
        direction === 'output' ? 'output' : 'input',
      ),
    );
  }

  @ApiBearerAuth()
  @Post(':id/output-assets')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async uploadOutputAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessPrincipal,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (user.client !== 'web')
      throw new ForbiddenException(
        'Only web sessions can upload editor output assets',
      );
    if (!file)
      throw new BadRequestException({
        code: 'UNSUPPORTED_MEDIA',
        message: 'File is required',
      });
    return response(await this.edits.addOutputAsset(id, user.userId, file));
  }
}
