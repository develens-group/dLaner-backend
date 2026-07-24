import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentSession, CurrentUser } from '../common/decorators';
import { UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/v1/users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() async me(@CurrentUser() user: AccessPrincipal) {
    return response(await this.users.getMe(user.userId));
  }
  @Patch() async update(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: UpdateProfileDto,
  ) {
    return response(await this.users.updateMe(user.userId, dto));
  }
  @Delete() async remove(@CurrentUser() user: AccessPrincipal) {
    return response(await this.users.deleteMe(user.userId));
  }
  @Get('sessions') async sessions(
    @CurrentUser() user: AccessPrincipal,
    @CurrentSession() sid: string,
  ) {
    return response(await this.users.sessions(user.userId, sid));
  }
  @Delete('sessions/:sessionId')
  async revoke(
    @CurrentUser() user: AccessPrincipal,
    @Param('sessionId', ParseUUIDPipe) sid: string,
  ) {
    return response(await this.users.revokeSession(user.userId, sid));
  }
}
