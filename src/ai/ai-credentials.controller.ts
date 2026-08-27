import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import {
  CreateAiCredentialDto,
  UpdateAiCredentialDto,
} from './ai-credentials.dto';
import { AiCredentialsService } from './ai-credentials.service';

@ApiTags('ai-credentials')
@ApiBearerAuth()
@Controller('api/v1/ai/credentials')
export class AiCredentialsController {
  constructor(private readonly credentials: AiCredentialsService) {}

  @Get()
  async list(@CurrentUser() user: AccessPrincipal) {
    return response(await this.credentials.list(user.userId));
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: CreateAiCredentialDto,
  ) {
    return response(await this.credentials.create(user.userId, dto));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiCredentialDto,
  ) {
    return response(await this.credentials.update(user.userId, id, dto));
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.credentials.remove(user.userId, id));
  }
}
