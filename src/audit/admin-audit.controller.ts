import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import { Roles } from '../common/decorators';
import { AuditLogQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    const result = await this.audit.list(query);
    return response(result.items, result.meta);
  }
}
