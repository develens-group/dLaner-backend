import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { ApiRequestQueryDto } from './api-requests.dto';
import { ApiRequestsService } from './api-requests.service';

@ApiTags('admin-api-requests')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/api-requests')
export class ApiRequestsController {
  constructor(private readonly service: ApiRequestsService) {}
  @Get() async list(@Query() query: ApiRequestQueryDto) {
    const result = await this.service.list(query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('stats') async stats(@Query() query: ApiRequestQueryDto) {
    return response(await this.service.stats(query));
  }
  @Get(':requestId') async get(
    @Param('requestId') id: string,
    @CurrentUser() actor: AccessPrincipal,
  ) {
    return response(await this.service.get(id, actor.userId));
  }
}
