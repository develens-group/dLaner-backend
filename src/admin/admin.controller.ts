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
import {
  AdminCreateUserDto,
  AdminResetPasswordDto,
  ChangeUserPlanDto,
  ChangeUserRoleDto,
  UserActivityQueryDto,
  UserQueryDto,
} from './admin.dto';
import { AdminActivityService } from './admin-activity.service';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/users')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly activity: AdminActivityService,
  ) {}
  @Get() async list(@Query() query: UserQueryDto) {
    const result = await this.admin.list(query);
    return response(result.items, result.meta);
  }
  @Post()
  async create(
    @CurrentUser() actor: AccessPrincipal,
    @Body() dto: AdminCreateUserDto,
  ) {
    return response(await this.admin.create(actor, dto));
  }
  @Get(':userId/activity')
  async userActivity(
    @Param('userId', ParseUUIDPipe) id: string,
    @Query() query: UserActivityQueryDto,
  ) {
    const result = await this.activity.list(id, query);
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
  @Post(':userId/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return response(
      await this.admin.resetPassword(actor, id, dto.newPassword),
    );
  }
  @Patch(':userId/role')
  @Roles(UserRole.SUPER_ADMIN)
  async changeRole(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    return response(await this.admin.changeRole(actor, id, dto.role));
  }
}
