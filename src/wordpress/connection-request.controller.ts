import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Public } from '../common/decorators';
import { ConnectionRequestService } from './connection-request.service';
import { CreateConnectionRequestDto } from './wordpress.dto';

@ApiTags('wordpress-connect')
@Controller('api/v1/wordpress/connection-requests')
export class ConnectionRequestController {
  constructor(private readonly connections: ConnectionRequestService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(@Body() dto: CreateConnectionRequestDto) {
    return response(await this.connections.create(dto));
  }

  @Public()
  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return response(await this.connections.get(id));
  }

  @ApiBearerAuth()
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessPrincipal,
  ) {
    this.assertWeb(user);
    return response(await this.connections.approve(id, user.userId));
  }

  @ApiBearerAuth()
  @Post(':id/deny')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async deny(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessPrincipal,
  ) {
    this.assertWeb(user);
    return response(await this.connections.deny(id, user.userId));
  }

  private assertWeb(user: AccessPrincipal) {
    if (user.client !== 'web')
      throw new ForbiddenException(
        'Only web sessions can approve WordPress connections',
      );
  }
}
