import { WordPressContentService } from './wordpress-content.service';
import { WordPressContentController } from './wordpress-content.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplatesModule } from '../templates/templates.module';
import { ConnectionRequestController } from './connection-request.controller';
import { ConnectionRequestService } from './connection-request.service';
import { EditSessionController } from './edit-session.controller';
import { EditSessionService } from './edit-session.service';
import {
  WordPressInstallationGuard,
  WordPressOrWebGuard,
} from './wordpress-installation.guard';
import { WordPressInstallationService } from './wordpress-installation.service';
import { WordPressController } from './wordpress.controller';
import { WordPressService } from './wordpress.service';

@Module({
  imports: [AuthModule, TemplatesModule],
  controllers: [
    WordPressContentController,
    WordPressController,
    ConnectionRequestController,
    EditSessionController,
  ],
  providers: [
    WordPressContentService,
    WordPressService,
    WordPressInstallationService,
    WordPressInstallationGuard,
    WordPressOrWebGuard,
    ConnectionRequestService,
    EditSessionService,
  ],
  exports: [
    WordPressService,
    WordPressInstallationService,
    EditSessionService,
    WordPressContentService,
  ],
})
export class WordPressModule {}
