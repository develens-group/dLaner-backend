import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { FAKE_AI_TYPE_IDS } from './fake-ai.catalog';
import { FakeAiExecuteDto } from './fake-ai.dto';
import { FakeAiService } from './fake-ai.service';

@ApiTags('ai-fake')
@ApiBearerAuth()
@Controller('api/v1/ai/fake')
export class FakeAiController {
  constructor(private readonly fakeAi: FakeAiService) {}

  @Get('types')
  @ApiOperation({
    summary: 'List fake AI types with credit costs and input templates',
  })
  listTypes() {
    return response(this.fakeAi.listTypes());
  }

  @Post()
  @ApiOperation({
    summary: 'Run a fake AI image operation (returns random loremflickr URL)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: [...FAKE_AI_TYPE_IDS],
          example: 'remove-background',
        },
        image: { type: 'string', format: 'binary' },
        prompt: { type: 'string', example: 'remove the person on the left' },
        style: { type: 'string', example: 'pencil' },
        strength: { type: 'string', example: '0.7' },
        scale: { type: 'string', example: '2' },
        width: { type: 'string', example: '512' },
        height: { type: 'string', example: '512' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async execute(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: FakeAiExecuteDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (!dto?.type) throw new BadRequestException('type is required');
    return response(
      await this.fakeAi.execute(user.userId, {
        type: dto.type,
        prompt: dto.prompt,
        style: dto.style,
        strength: dto.strength,
        scale: dto.scale,
        width: dto.width,
        height: dto.height,
        image,
      }),
    );
  }
}
