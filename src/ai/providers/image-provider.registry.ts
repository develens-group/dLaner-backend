import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderVariant } from '@prisma/client';

export interface ImageExecuteInput {
  image?: Express.Multer.File;
  prompt?: string;
  [key: string]: unknown;
}

export interface ImageExecuteResult {
  imageUrl: string;
  providerRequestId?: string;
  raw?: unknown;
}

export interface ImageProviderAdapter {
  readonly id: string;
  execute(
    variant: AiProviderVariant,
    input: ImageExecuteInput,
  ): Promise<ImageExecuteResult>;
}

@Injectable()
export class StubImageProvider implements ImageProviderAdapter {
  constructor(readonly id: string) {}
  execute(): Promise<ImageExecuteResult> {
    throw new ServiceUnavailableException({
      code: 'PROVIDER_NOT_IMPLEMENTED',
      message: `Provider ${this.id} is not implemented yet`,
    });
  }
}

@Injectable()
export class ReplicateImageProvider implements ImageProviderAdapter {
  readonly id = 'replicate';

  constructor(private readonly config: ConfigService) {}

  async execute(
    variant: AiProviderVariant,
    input: ImageExecuteInput,
  ): Promise<ImageExecuteResult> {
    const token = this.config.get<string>('REPLICATE_API_TOKEN', '');
    if (!token)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'REPLICATE_API_TOKEN is not configured',
      });

    const imageDataUrl = input.image
      ? `data:${input.image.mimetype};base64,${input.image.buffer.toString('base64')}`
      : undefined;

    const config =
      variant.configJson && typeof variant.configJson === 'object'
        ? (variant.configJson as Record<string, unknown>)
        : {};
    const inputMap =
      config.input && typeof config.input === 'object'
        ? (config.input as Record<string, string>)
        : {};

    const predictionInput: Record<string, unknown> = {
      ...(typeof config.defaults === 'object' && config.defaults
        ? (config.defaults as Record<string, unknown>)
        : {}),
    };

    const imageKey = inputMap.image ?? 'image';
    const promptKey = inputMap.prompt ?? 'prompt';
    if (imageDataUrl) predictionInput[imageKey] = imageDataUrl;
    if (input.prompt) predictionInput[promptKey] = input.prompt;

    const version =
      typeof config.version === 'string' ? config.version : undefined;

    const body: Record<string, unknown> = {
      input: predictionInput,
    };
    if (version) body.version = version;
    else body.model = variant.externalModel;

    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify(body),
    });

    const payload = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      output?: unknown;
      error?: string;
      urls?: { get?: string };
    };

    if (!createRes.ok) {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: payload.error || `Replicate HTTP ${createRes.status}`,
      });
    }

    let result = payload;
    let attempts = 0;
    while (
      result.status &&
      !['succeeded', 'failed', 'canceled'].includes(result.status) &&
      attempts < 60
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      const getUrl =
        result.urls?.get ??
        `https://api.replicate.com/v1/predictions/${result.id}`;
      const poll = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      result = (await poll.json()) as typeof payload;
      attempts += 1;
    }

    if (result.status !== 'succeeded') {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: result.error || `Replicate status: ${result.status}`,
      });
    }

    const imageUrl = extractImageUrl(result.output);
    if (!imageUrl)
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: 'Replicate returned no image URL',
      });

    return {
      imageUrl,
      providerRequestId: result.id,
      raw: result.output,
    };
  }
}

function extractImageUrl(output: unknown): string | undefined {
  if (typeof output === 'string' && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
  }
  if (output && typeof output === 'object') {
    const rec = output as Record<string, unknown>;
    for (const key of ['image', 'output', 'url', 'result']) {
      const found = extractImageUrl(rec[key]);
      if (found) return found;
    }
  }
  return undefined;
}

@Injectable()
export class ImageProviderRegistry {
  private readonly adapters = new Map<string, ImageProviderAdapter>();

  constructor(replicate: ReplicateImageProvider) {
    this.adapters.set(replicate.id, replicate);
    for (const id of ['openai', 'stability']) {
      this.adapters.set(id, new StubImageProvider(id));
    }
  }

  get(provider: string): ImageProviderAdapter {
    const adapter = this.adapters.get(provider.toLowerCase());
    if (!adapter)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_NOT_IMPLEMENTED',
        message: `Unknown provider: ${provider}`,
      });
    return adapter;
  }
}
