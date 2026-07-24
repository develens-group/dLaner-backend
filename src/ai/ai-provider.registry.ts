import { Injectable, NotFoundException } from '@nestjs/common';
import { AiProvider } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';
@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();
  constructor(mock: MockAiProvider) {
    this.providers.set(mock.name, mock);
  }
  get(name: string) {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) throw new NotFoundException('AI provider is not configured');
    return provider;
  }
}
