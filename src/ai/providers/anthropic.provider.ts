import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiExecutionRequest,
  AiExecutionResult,
  AiProvider,
  AiProviderError,
} from '../ai-provider';
import {
  maxOutputTokens,
  resolveChatMessages,
  type ChatMessage,
} from './ai-input.utils';
import { providerFetch } from './provider-http';

interface AnthropicResponse {
  id?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return !!this.apiKey();
  }

  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    const apiKey = request.apiKey?.trim() || this.apiKey();
    if (!apiKey)
      throw new AiProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'Anthropic is not configured on the platform',
      );
    const messages = resolveChatMessages(request.operation, request.input);
    const system = messages
      .filter((item) => item.role === 'system')
      .map((item) => item.content)
      .join('\n\n');
    const payload = await providerFetch<AnthropicResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: maxOutputTokens(request.input),
          ...(system ? { system } : {}),
          messages: toAnthropicMessages(messages),
        }),
      },
      this.name,
    );
    const text = payload.content
      ?.map((item) => (item.type === 'text' ? item.text : undefined))
      .filter((item): item is string => !!item)
      .join('\n')
      .trim();
    if (!text)
      throw new AiProviderError(
        'EMPTY_RESPONSE',
        'Anthropic returned no content',
      );
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    return {
      output: { text },
      providerRequestId: payload.id,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  private apiKey() {
    return this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
  }
}

function toAnthropicMessages(messages: ChatMessage[]) {
  return messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    }));
}
