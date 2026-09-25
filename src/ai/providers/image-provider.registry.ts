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

    const versionFromConfig =
      typeof config.version === 'string' ? config.version : undefined;

    const versionId = await this.resolveVersionId(
      token,
      variant.externalModel,
      versionFromConfig,
    );

    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        version: versionId,
        input: predictionInput,
      }),
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

  /**
   * Community models need a version hash on POST /v1/predictions.
   * Accepts: 64-hex, owner/name:hash, owner/name (resolved via models API),
   * or an explicit configJson.version.
   */
  private async resolveVersionId(
    token: string,
    externalModel: string,
    versionFromConfig?: string,
  ): Promise<string> {
    const candidate = (versionFromConfig ?? externalModel).trim();

    if (/^[a-f0-9]{64}$/i.test(candidate)) return candidate;

    const withHash = /^([^/]+\/[^:]+):([a-f0-9]{64})$/i.exec(candidate);
    if (withHash) return withHash[2];

    const ownerName = /^([^/]+)\/([^/]+)$/.exec(candidate);
    if (!ownerName) {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: `Invalid Replicate model id: ${candidate}`,
      });
    }

    const owner = encodeURIComponent(ownerName[1]);
    const name = encodeURIComponent(ownerName[2]);
    const res = await fetch(
      `https://api.replicate.com/v1/models/${owner}/${name}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: unknown;
      latest_version?: { id?: string };
    };
    if (!res.ok) {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: formatReplicateError(data, res.status),
      });
    }
    const id = data.latest_version?.id;
    if (!id) {
      throw new BadGatewayException({
        code: 'AI_PROVIDER_FAILED',
        message: `No latest_version for Replicate model ${candidate}`,
      });
    }
    return id;
  }
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
