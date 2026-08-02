import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
@Module({
  controllers: [AdminController, AdminDashboardController],
  providers: [AdminService, AdminDashboardService],
})
export class AdminModule {}
