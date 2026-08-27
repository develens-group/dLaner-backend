import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PLATFORM_CATALOG,
  AI_PROVIDER_ENV_KEYS,
} from './ai-platform.config';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Injectable()
export class AiCatalogService {
  constructor(
    private readonly config: ConfigService,
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly google: GoogleProvider,
  ) {}

  list() {
    const enabled = new Set(this.enabledProviderIds());
    return {
      providers: AI_PLATFORM_CATALOG.filter((provider) =>
        enabled.has(provider.id),
      ).map((provider) => ({
        ...provider,
        billingMode: 'platform_credits' as const,
      })),
      billingMode: 'platform_credits' as const,
    };
  }

  private enabledProviderIds() {
    const configured = [
      this.openai.isConfigured() ? 'openai' : null,
      this.anthropic.isConfigured() ? 'anthropic' : null,
      this.google.isConfigured() ? 'google' : null,
    ].filter((item): item is string => !!item);
    const allowMock =
      this.config.get('AI_MOCK_PROVIDER_ENABLED', 'true') === 'true';
    return [...configured, ...(allowMock ? ['mock'] : [])];
  }

  isProviderConfigured(providerId: string) {
    if (providerId === 'mock')
      return this.config.get('AI_MOCK_PROVIDER_ENABLED', 'true') === 'true';
    const envKey = AI_PROVIDER_ENV_KEYS[providerId];
    return !!envKey && !!this.config.get<string>(envKey)?.trim();
  }
}
