import {
  BadGatewayException,
  BadRequestException,
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

type OpenAiImageMode = 'generations' | 'edits';

function resolveMode(
  variant: AiProviderVariant,
  input: ImageExecuteInput,
): OpenAiImageMode {
  const config =
    variant.configJson && typeof variant.configJson === 'object'
      ? (variant.configJson as Record<string, unknown>)
      : {};
  if (config.mode === 'edits' || config.mode === 'generations') {
    return config.mode;
  }
  // Heuristic: image + prompt ⇒ edits; prompt-only ⇒ generations.
  return input.image ? 'edits' : 'generations';
}

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

    const mode = resolveMode(variant, input);
    const prompt = input.prompt?.trim();
    if (!prompt)
      throw new BadRequestException({
        code: 'PROMPT_REQUIRED',
        message: 'A non-empty prompt is required for OpenAI image operations',
      });

    if (mode === 'edits') {
      if (!input.image?.buffer?.length)
        throw new BadRequestException({
          code: 'IMAGE_REQUIRED',
          message: 'An input image is required for OpenAI image edits',
        });
      return this.runEdits(variant, input, apiKey, prompt);
    }

    return this.runGenerations(variant, prompt, apiKey);
  }

  private async runGenerations(
    variant: AiProviderVariant,
    prompt: string,
    apiKey: string,
  ): Promise<ImageExecuteResult> {
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

    return this.readImageResponse(res);
  }

  private async runEdits(
    variant: AiProviderVariant,
    input: ImageExecuteInput,
    apiKey: string,
    prompt: string,
  ): Promise<ImageExecuteResult> {
    const form = new FormData();
    form.append('model', variant.externalModel);
    form.append('prompt', prompt);
    form.append('n', '1');
    const file = new File(
      [new Uint8Array(input.image!.buffer)],
      input.image!.originalname || 'image.png',
      { type: input.image!.mimetype || 'image/png' },
    );
    form.append('image', file);

    const config =
      variant.configJson && typeof variant.configJson === 'object'
        ? (variant.configJson as Record<string, unknown>)
        : {};
    const defaults =
      config.defaults && typeof config.defaults === 'object'
        ? (config.defaults as Record<string, unknown>)
        : {};
    for (const [key, value] of Object.entries(defaults)) {
      if (value == null || key === 'model' || key === 'prompt' || key === 'n')
        continue;
      form.append(key, String(value));
    }

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    return this.readImageResponse(res);
  }

  private async readImageResponse(res: Response): Promise<ImageExecuteResult> {
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
