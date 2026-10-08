import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderVariant } from '@prisma/client';
import type {
  ImageExecuteInput,
  ImageExecuteResult,
  ImageProviderAdapter,
} from './image-provider.registry';

interface OpenAiImagesResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
}

/** Prompt-only OpenAI Images generations (Phase 2a BYOK). */
@Injectable()
export class OpenAiImageProvider implements ImageProviderAdapter {
  readonly id = 'openai';

  constructor(private readonly config: ConfigService) {}

  async execute(
    variant: AiProviderVariant,
    input: ImageExecuteInput,
    options?: { apiKey?: string },
  ): Promise<ImageExecuteResult> {
    const apiKey =
      options?.apiKey?.trim() ||
      this.config.get<string>('OPENAI_API_KEY', '')?.trim();
    if (!apiKey)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'OPENAI_API_KEY is not configured',
      });

    const prompt = input.prompt?.trim();
    if (!prompt)
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: 'OpenAI image generation requires a prompt',
      });

    const config =
      variant.configJson && typeof variant.configJson === 'object'
        ? (variant.configJson as Record<string, unknown>)
        : {};
    const defaults =
      config.defaults && typeof config.defaults === 'object'
        ? (config.defaults as Record<string, unknown>)
        : {};

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...defaults,
        model: variant.externalModel,
        prompt,
        n: 1,
      }),
    });

    const payload = (await res
      .json()
      .catch(() => ({}))) as OpenAiImagesResponse;

    if (!res.ok)
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: payload.error?.message || `OpenAI HTTP ${res.status}`,
        providerStatus: res.status,
      });

    const first = payload.data?.[0];
    const imageUrl =
      first?.url ??
      (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);
    if (!imageUrl)
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: 'OpenAI returned no image',
      });

    return { imageUrl, raw: payload };
  }
}
