import { Module } from '@nestjs/common';
import { AdminAiController } from './admin-ai.controller';
import { AiController } from './ai.controller';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiService } from './ai.service';
import { MockAiProvider } from './mock-ai.provider';
import { CreditsModule } from '../credits/credits.module';
import { ConfigService } from '@nestjs/config';
import {
  AI_HISTORY_STORE,
  CloudflareD1AiHistoryStore,
  NoopAiHistoryStore,
} from './ai-history.store';
@Module({
  imports: [CreditsModule],
  controllers: [AiController, AdminAiController],
  providers: [
    MockAiProvider,
    AiProviderRegistry,
    {
      provide: AI_HISTORY_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('AI_HISTORY_STORAGE_DRIVER', 'postgres') === 'cloudflare-d1'
          ? new CloudflareD1AiHistoryStore(config)
          : new NoopAiHistoryStore(),
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
