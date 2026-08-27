import { ConfigService } from '@nestjs/config';
import { AiCatalogService } from './ai-catalog.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { OpenAiProvider } from './providers/openai.provider';

describe('AiCatalogService', () => {
  it('lists hybrid billing modes and platform providers', async () => {
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'OPENAI_API_KEY') return 'sk-test';
        if (key === 'AI_MOCK_PROVIDER_ENABLED') return 'false';
        return fallback;
      },
    } as ConfigService;
    const prisma = {
      userAiCredential: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AiCatalogService(
      config,
      prisma as never,
      new OpenAiProvider(config),
      new AnthropicProvider(config),
      new GoogleProvider(config),
    );
    const result = await service.list('user-1');
    expect(result.billingModes).toEqual(['platform_credits', 'user_key']);
    expect(result.providers.map((item) => item.id)).toEqual([
      'openai',
      'anthropic',
      'google',
    ]);
    expect(result.providers[0]).toMatchObject({
      id: 'openai',
      platformConfigured: true,
      supportsUserKey: true,
    });
  });
});
