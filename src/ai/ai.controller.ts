import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentRequestId, CurrentUser } from '../common/decorators';
import { AiCatalogService } from './ai-catalog.service';
import { AiRequestQueryDto, CreateAiRequestDto } from './ai.dto';
import { AiService } from './ai.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('api/v1/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly catalog: AiCatalogService,
  ) {}
  @Get('catalog')
  async catalogList(@CurrentUser() user: AccessPrincipal) {
    return response(await this.catalog.list(user.userId));
  }
  @Post('requests') async create(
    @CurrentUser() user: AccessPrincipal,
    @CurrentRequestId() requestId: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateAiRequestDto,
  ) {
    return response(
      await this.ai.createAndExecute(user.userId, requestId, key, dto),
    );
  }
  @Get('requests') async list(
    @CurrentUser() user: AccessPrincipal,
    @Query() query: AiRequestQueryDto,
  ) {
    const result = await this.ai.list(user.userId, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('requests/:id') async get(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.ai.get(id, user.userId));
  }
  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.ai.cancel(id, user.userId));
  }
}
