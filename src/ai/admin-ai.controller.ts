import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { AiRequestQueryDto } from './ai.dto';
import { AiService } from './ai.service';

@ApiTags('admin-ai')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/ai-requests')
export class AdminAiController {
  constructor(
    private readonly ai: AiService,
    private readonly audit: AuditService,
  ) {}
  @Get() async list(@Query() query: AiRequestQueryDto) {
    const result = await this.ai.list(undefined, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('stats') async stats() {
    return response(await this.ai.stats());
  }
  @Get(':id') async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessPrincipal,
  ) {
    const item = await this.ai.get(id);
    this.audit.record(
      'ai_request.detail_viewed',
      actor.userId,
      id,
      'AiRequest',
    );
    return response(item);
  }
}
