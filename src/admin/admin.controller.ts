import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { UserQueryDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/users')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get() async list(@Query() query: UserQueryDto) {
    const result = await this.admin.list(query);
    return response(result.items, result.meta);
  }
  @Get(':userId') async get(@Param('userId', ParseUUIDPipe) id: string) {
    return response(await this.admin.get(id));
  }
  @Post(':userId/block') async block(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.admin.block(actor, id));
  }
  @Post(':userId/unblock') async unblock(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.admin.unblock(actor, id));
  }
}
