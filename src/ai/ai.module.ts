import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditsModule } from '../credits/credits.module';
import { AdminAiController } from './admin-ai.controller';
import { AdminAiCatalogController } from './admin-ai-catalog.controller';
import { AiCatalogService } from './ai-catalog.service';
import { AiCredentialsController } from './ai-credentials.controller';
import { AiCredentialsService } from './ai-credentials.service';
import {
  AI_HISTORY_STORE,
  CloudflareD1AiHistoryStore,
  NoopAiHistoryStore,
} from './ai-history.store';
import { AiOperationsCatalogService } from './ai-operations.catalog';
import { AiOperationsController } from './ai-operations.controller';
import { AiOperationsExecuteService } from './ai-operations.execute.service';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FakeAiController } from './fake-ai.controller';
import { FakeAiService } from './fake-ai.service';
import { MockAiProvider } from './mock-ai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import {
  ImageProviderRegistry,
  ReplicateImageProvider,
} from './providers/image-provider.registry';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [CreditsModule],
  controllers: [
    AiController,
    AiCredentialsController,
    AdminAiController,
    AdminAiCatalogController,
    AiOperationsController,
    FakeAiController,
  ],
  providers: [
    MockAiProvider,
    OpenAiProvider,
    AnthropicProvider,
    GoogleProvider,
    AiCatalogService,
    AiCredentialsService,
    AiProviderRegistry,
    AiOperationsCatalogService,
    AiOperationsExecuteService,
    ReplicateImageProvider,
    ImageProviderRegistry,
    {
      provide: AI_HISTORY_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('AI_HISTORY_STORAGE_DRIVER', 'postgres') === 'cloudflare-d1'
          ? new CloudflareD1AiHistoryStore(config)
          : new NoopAiHistoryStore(),
    },
    AiService,
    FakeAiService,
  ],
  exports: [AiService],
})
export class AiModule {}
