import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiExecutionRequest,
  AiExecutionResult,
  AiProvider,
  AiProviderError,
} from '../ai-provider';
import { maxOutputTokens, resolveChatMessages } from './ai-input.utils';
import { providerFetch } from './provider-http';

interface XaiResponse {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * xAI (Grok) exposes an OpenAI-compatible chat completions API, so the
 * request/response shape mirrors OpenAiProvider.
 */
@Injectable()
export class XaiProvider implements AiProvider {
  readonly name = 'xai';

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return !!this.apiKey();
  }

  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    const apiKey = request.apiKey?.trim() || this.apiKey();
    if (!apiKey)
      throw new AiProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'xAI is not configured on the platform',
      );
    const messages = resolveChatMessages(request.operation, request.input);
    const payload = await providerFetch<XaiResponse>(
      'https://api.x.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages,
          max_tokens: maxOutputTokens(request.input),
        }),
      },
      this.name,
    );
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text)
      throw new AiProviderError('EMPTY_RESPONSE', 'xAI returned no content');
    return {
      output: { text },
      providerRequestId: payload.id,
      usage: {
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
    };
  }

  private apiKey() {
    return this.config.get<string>('XAI_API_KEY')?.trim();
  }
}
