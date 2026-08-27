import { ConfigService } from '@nestjs/config';
import { AiCatalogService } from './ai-catalog.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { OpenAiProvider } from './providers/openai.provider';

describe('AiCatalogService', () => {
  it('returns only configured providers', () => {
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'OPENAI_API_KEY') return 'sk-test';
        if (key === 'AI_MOCK_PROVIDER_ENABLED') return 'true';
        return fallback;
      },
    } as ConfigService;
    const service = new AiCatalogService(
      config,
      new OpenAiProvider(config),
      new AnthropicProvider(config),
      new GoogleProvider(config),
    );
    expect(service.list().providers.map((item) => item.id)).toEqual(['openai']);
  });
});
