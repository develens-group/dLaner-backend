import { Module } from '@nestjs/common';
import { WordPressController } from './wordpress.controller';
import { WordPressService } from './wordpress.service';

@Module({
  controllers: [WordPressController],
  providers: [WordPressService],
  exports: [WordPressService],
})
export class WordPressModule {}
