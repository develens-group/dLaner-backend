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

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

@Injectable()
export class GoogleProvider implements AiProvider {
  readonly name = 'google';

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return !!this.apiKey();
  }

  async execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    const apiKey = this.apiKey();
    if (!apiKey)
      throw new AiProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'Google Gemini is not configured on the platform',
      );
    const messages = resolveChatMessages(request.operation, request.input);
    const payload = await providerFetch<GeminiResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: buildSystemInstruction(messages),
          contents: toGeminiContents(messages),
          generationConfig: {
            maxOutputTokens: maxOutputTokens(request.input),
          },
        }),
      },
      this.name,
    );
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((item) => item.text)
      .filter((item): item is string => !!item)
      .join('\n')
      .trim();
    if (!text)
      throw new AiProviderError(
        'EMPTY_RESPONSE',
        'Google Gemini returned no content',
      );
    return {
      output: { text },
      usage: {
        promptTokens: payload.usageMetadata?.promptTokenCount,
        completionTokens: payload.usageMetadata?.candidatesTokenCount,
        totalTokens: payload.usageMetadata?.totalTokenCount,
      },
    };
  }

  private apiKey() {
    return this.config.get<string>('GOOGLE_AI_API_KEY')?.trim();
  }
}

function buildSystemInstruction(messages: ChatMessage[]) {
  const system = messages
    .filter((item) => item.role === 'system')
    .map((item) => item.content)
    .join('\n\n');
  return system
    ? { parts: [{ text: system }] }
    : undefined;
}

function toGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }));
}
