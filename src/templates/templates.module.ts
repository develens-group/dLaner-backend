import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminTemplatesController,
  PublicTemplatesController,
  TemplateCategoriesController,
  TemplatesController,
  TemplateSharesController,
} from './templates.controller';
import {
  LocalTemplateStorage,
  OBJECT_STORAGE,
  S3TemplateStorage,
} from './template-storage';
import { TemplatesService } from './templates.service';
@Module({
  controllers: [
    TemplatesController,
    PublicTemplatesController,
    TemplateSharesController,
    TemplateCategoriesController,
    AdminTemplatesController,
  ],
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        c.get('TEMPLATE_STORAGE_DRIVER', 'local') === 's3'
          ? new S3TemplateStorage(c)
          : new LocalTemplateStorage(c),
    },
    TemplatesService,
  ],
  exports: [TemplatesService],
})
export class TemplatesModule {}
