import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { TemplatesModule } from '../templates/templates.module';
import { LandsController } from './lands.controller';
import { LandsService } from './lands.service';

@Module({
  imports: [TemplatesModule, BillingModule],
  controllers: [LandsController],
  providers: [LandsService],
  exports: [LandsService],
})
export class LandsModule {}
