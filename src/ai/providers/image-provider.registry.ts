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

    const { url, body } = buildReplicateCreateRequest(
      variant.externalModel,
      version,
      predictionInput,
    );

    const createRes = await fetch(url, {
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
      detail?: unknown;
      urls?: { get?: string };
    };

    if (!createRes.ok) {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: formatReplicateError(payload, createRes.status),
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

function buildReplicateCreateRequest(
  externalModel: string,
  versionFromConfig: string | undefined,
  predictionInput: Record<string, unknown>,
): { url: string; body: Record<string, unknown> } {
  const inputBody = { input: predictionInput };

  // Explicit version hash or owner/name:hash from admin configJson.version
  if (versionFromConfig) {
    return {
      url: 'https://api.replicate.com/v1/predictions',
      body: { ...inputBody, version: versionFromConfig },
    };
  }

  const trimmed = externalModel.trim();
  // owner/name:64hex → community model with pinned version
  if (/^[^/]+\/[^:]+:[a-f0-9]{64}$/i.test(trimmed)) {
    return {
      url: 'https://api.replicate.com/v1/predictions',
      body: { ...inputBody, version: trimmed },
    };
  }
  // bare 64-char version id
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return {
      url: 'https://api.replicate.com/v1/predictions',
      body: { ...inputBody, version: trimmed },
    };
  }
  // owner/name → models endpoint (works for community + official)
  const parts = trimmed.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const owner = encodeURIComponent(parts[0]);
    const name = encodeURIComponent(parts[1]);
    return {
      url: `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
      body: inputBody,
    };
  }

  // Fallback: treat as version identifier on unified predictions API
  return {
    url: 'https://api.replicate.com/v1/predictions',
    body: { ...inputBody, version: trimmed },
  };
}

function formatReplicateError(
  payload: { error?: string; detail?: unknown },
  status: number,
): string {
  if (typeof payload.error === 'string' && payload.error.trim())
    return payload.error;
  if (typeof payload.detail === 'string' && payload.detail.trim())
    return payload.detail;
  if (Array.isArray(payload.detail)) {
    const parts = payload.detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const loc = Array.isArray(rec.loc) ? rec.loc.join('.') : '';
        const msg = typeof rec.msg === 'string' ? rec.msg : JSON.stringify(item);
        return loc ? `${loc}: ${msg}` : msg;
      }
      return JSON.stringify(item);
    });
    if (parts.length) return parts.join('; ');
  }
  if (payload.detail && typeof payload.detail === 'object')
    return JSON.stringify(payload.detail);
  return `Replicate HTTP ${status}`;
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
