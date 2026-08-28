import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { AdminActivityService } from './admin-activity.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
@Module({
  imports: [CreditsModule],
  controllers: [AdminController, AdminDashboardController],
  providers: [AdminService, AdminDashboardService, AdminActivityService],
})
export class AdminModule {}
