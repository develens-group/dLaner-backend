import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
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

interface GeminiImagePart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiImageResponse {
  candidates?: Array<{
    content?: { parts?: GeminiImagePart[] };
  }>;
  error?: { message?: string; status?: string };
}

type GoogleImageMode = 'generations' | 'edits';

function resolveMode(
  variant: AiProviderVariant,
  input: ImageExecuteInput,
): GoogleImageMode {
  const config =
    variant.configJson && typeof variant.configJson === 'object'
      ? (variant.configJson as Record<string, unknown>)
      : {};
  if (config.mode === 'edits' || config.mode === 'generations') {
    return config.mode;
  }
  return input.image ? 'edits' : 'generations';
}

@Injectable()
export class GoogleImageProvider implements ImageProviderAdapter {
  readonly id = 'google';

  constructor(private readonly config: ConfigService) {}

  async execute(
    variant: AiProviderVariant,
    input: ImageExecuteInput,
    options?: { apiKey?: string },
  ): Promise<ImageExecuteResult> {
    const apiKey =
      options?.apiKey?.trim() ||
      this.config.get<string>('GOOGLE_AI_API_KEY', '')?.trim();
    if (!apiKey)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'GOOGLE_AI_API_KEY is not configured',
      });

    const prompt = input.prompt?.trim();
    if (!prompt)
      throw new BadRequestException({
        code: 'PROMPT_REQUIRED',
        message: 'A non-empty prompt is required for Google image operations',
      });

    const mode = resolveMode(variant, input);
    if (mode === 'edits' && !input.image?.buffer?.length) {
      throw new BadRequestException({
        code: 'IMAGE_REQUIRED',
        message: 'An input image is required for Google image edits',
      });
    }

    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (input.image?.buffer?.length) {
      parts.push({
        inlineData: {
          mimeType: input.image.mimetype || 'image/png',
          data: input.image.buffer.toString('base64'),
        },
      });
    }

    const model = normalizeGoogleImageModel(variant.externalModel);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as GeminiImageResponse;

    if (!res.ok) {
      const message =
        payload.error?.message || `Google Gemini HTTP ${res.status}`;
      if (res.status === 429) {
        const freeTierBlocked =
          /free_tier/i.test(message) && /limit:\s*0/i.test(message);
        throw new HttpException(
          {
            code: 'AI_PROVIDER_QUOTA',
            message: freeTierBlocked
              ? 'Google Gemini image models are not available on the free tier for this API key. Enable billing in Google AI Studio (paid tier), then retry. Text models may still work on free tier.'
              : 'Google Gemini quota exceeded for this API key / model. Pick another image model, wait for reset, or enable billing in Google AI Studio.',
            detail: message,
            providerStatus: res.status,
            model,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message,
        providerStatus: res.status,
      });
    }

    const imageUrl = extractImageDataUrl(payload);
    if (!imageUrl) {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: 'Google Gemini returned no image',
      });
    }

    return { imageUrl, raw: payload };
  }
}

function extractImageDataUrl(payload: GeminiImageResponse): string | undefined {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data?.trim();
    if (!data) continue;
    const mime = part.inlineData?.mimeType?.trim() || 'image/png';
    return `data:${mime};base64,${data}`;
  }
  return undefined;
}

/** Drop deprecated preview aliases that Google still lists for some keys. */
export function normalizeGoogleImageModel(externalModel: string): string {
  const model = externalModel.replace(/^models\//, '').trim();
  if (/gemini-2\.5-flash-(preview-)?image/i.test(model)) {
    return 'gemini-2.5-flash-image';
  }
  if (/preview/i.test(model) && /image/i.test(model)) {
    return 'gemini-3.1-flash-image';
  }
  return model;
}
