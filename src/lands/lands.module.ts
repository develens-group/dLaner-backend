import { LandImagesController } from './land-images.controller';
import { LandImagesService } from './land-images.service';
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { TemplatesModule } from '../templates/templates.module';
import { LandsController } from './lands.controller';
import { LandsService } from './lands.service';

@Module({
  imports: [TemplatesModule, BillingModule],
  controllers: [LandsController, LandImagesController],
  providers: [LandsService, LandImagesService],
  exports: [LandsService, LandImagesService],
})
export class LandsModule {}
