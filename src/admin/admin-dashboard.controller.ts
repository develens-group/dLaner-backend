import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { response } from '../common/api-response';
import { Roles } from '../common/decorators';
import { AdminDashboardService } from './admin-dashboard.service';
import { DashboardQueryDto } from './admin.dto';

@ApiTags('admin-dashboard')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}
  @Get()
  @ApiOperation({ summary: 'Aggregated administration dashboard statistics' })
  async get(@Query() query: DashboardQueryDto) {
    return response(await this.dashboard.get(query.days));
  }
}
