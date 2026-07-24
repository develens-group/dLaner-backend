import { Module } from '@nestjs/common';
import { AdminAiController } from './admin-ai.controller';
import { AiController } from './ai.controller';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiService } from './ai.service';
import { MockAiProvider } from './mock-ai.provider';
import { CreditsModule } from '../credits/credits.module';
@Module({
  imports: [CreditsModule],
  controllers: [AiController, AdminAiController],
  providers: [MockAiProvider, AiProviderRegistry, AiService],
  exports: [AiService],
})
export class AiModule {}
