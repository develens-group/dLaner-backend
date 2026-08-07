import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { ChangeUserPlanDto, UserQueryDto } from './admin.dto';
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
  @Post(':userId/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.admin.block(actor, id));
  }
  @Post(':userId/unblock')
  @HttpCode(HttpStatus.OK)
  async unblock(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.admin.unblock(actor, id));
  }
  @Patch(':userId/plan')
  async changePlan(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserPlanDto,
  ) {
    return response(await this.admin.changePlan(actor, id, dto.plan));
  }
}
