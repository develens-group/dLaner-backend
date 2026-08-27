import { Injectable, NotFoundException } from '@nestjs/common';
import { AiProvider } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor(
    mock: MockAiProvider,
    openai: OpenAiProvider,
    anthropic: AnthropicProvider,
    google: GoogleProvider,
  ) {
    // Real providers stay registered for BYOK even without platform keys.
    for (const provider of [openai, anthropic, google]) {
      this.providers.set(provider.name, provider);
    }
    if (mock.isConfigured()) this.providers.set(mock.name, mock);
  }

  get(name: string) {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) throw new NotFoundException('AI provider is not configured');
    return provider;
  }

  list() {
    return [...this.providers.keys()];
  }
}
