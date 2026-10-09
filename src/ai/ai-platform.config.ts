import { AiOperation } from '@prisma/client';

export interface AiModelDefinition {
  id: string;
  label: string;
  operations: AiOperation[];
}

export interface AiProviderDefinition {
  id: string;
  name: string;
  models: AiModelDefinition[];
}

export const AI_PLATFORM_CATALOG: AiProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        operations: [AiOperation.CHAT, AiOperation.TEXT_GENERATION],
      },
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        operations: [AiOperation.CHAT, AiOperation.TEXT_GENERATION],
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        label: 'Claude Sonnet 4',
        operations: [AiOperation.CHAT, AiOperation.TEXT_GENERATION],
      },
      {
        id: 'claude-3-5-haiku-20241022',
        label: 'Claude 3.5 Haiku',
        operations: [AiOperation.CHAT, AiOperation.TEXT_GENERATION],
      },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    models: [
      {
        id: 'gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        operations: [AiOperation.CHAT, AiOperation.TEXT_GENERATION],
      },
    ],
  },
];

export const AI_PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
};
