import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCredentialStatus, AiOperation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly google: GoogleProvider,
  ) {}

  async list(userId?: string) {
    const credentials = userId
      ? await this.prisma.userAiCredential.findMany({
          where: {
            userId,
            status: { not: AiCredentialStatus.REVOKED },
          },
          select: {
            id: true,
            provider: true,
            label: true,
            keyHint: true,
            isDefault: true,
            status: true,
          },
        })
      : [];
    const byProvider = new Map<string, typeof credentials>();
    for (const item of credentials) {
      const list = byProvider.get(item.provider) ?? [];
      list.push(item);
      byProvider.set(item.provider, list);
    }
    const providers = AI_PLATFORM_CATALOG.map((provider) => {
      const platformConfigured = this.isProviderConfigured(provider.id);
      const userCredentials = byProvider.get(provider.id) ?? [];
      return {
        ...provider,
        platformConfigured,
        supportsUserKey: true,
        userConnected: userCredentials.length > 0,
        credentials: userCredentials,
        billingModes: [
          ...(platformConfigured ? (['platform_credits'] as const) : []),
          'user_key' as const,
        ],
      };
    });
    if (this.config.get('AI_MOCK_PROVIDER_ENABLED', 'true') === 'true') {
      providers.push({
        id: 'mock',
        name: 'Mock',
        models: [
          {
            id: 'mock-1',
            label: 'Mock',
            operations: [AiOperation.CHAT, AiOperation.TEXT_GENERATION],
          },
        ],
        platformConfigured: true,
        supportsUserKey: false,
        userConnected: false,
        credentials: [],
        billingModes: ['platform_credits'],
      });
    }
    return {
      billingModes: ['platform_credits', 'user_key'] as const,
      providers,
    };
  }

  isProviderConfigured(providerId: string) {
    if (providerId === 'mock')
      return this.config.get('AI_MOCK_PROVIDER_ENABLED', 'true') === 'true';
    if (providerId === 'openai') return this.openai.isConfigured();
    if (providerId === 'anthropic') return this.anthropic.isConfigured();
    if (providerId === 'google') return this.google.isConfigured();
    const envKey = AI_PROVIDER_ENV_KEYS[providerId];
    return !!envKey && !!this.config.get<string>(envKey)?.trim();
  }
}
