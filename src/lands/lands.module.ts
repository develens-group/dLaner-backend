import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { LandsController } from './lands.controller';
import { LandsService } from './lands.service';

@Module({
  imports: [TemplatesModule],
  controllers: [LandsController],
  providers: [LandsService],
  exports: [LandsService],
})
export class LandsModule {}
