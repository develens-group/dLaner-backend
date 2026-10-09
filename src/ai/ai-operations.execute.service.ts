import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiBillingMode,
  AiOperation,
  AiProviderVariant,
  AiRequestStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CreditService } from '../credits/credit.service';
import { formatCreditAmount } from '../credits/credit-units';
import { PrismaService } from '../prisma/prisma.service';
import { isByokImageProvider } from './ai-byok-image';
import { AiCredentialsService } from './ai-credentials.service';
import { isProviderAuthError, redactSecrets } from './ai-error-utils';
import { AiGalleryStorageService } from './ai-gallery.storage';
import { AiOperationsCatalogService } from './ai-operations.catalog';
import {
  ImageExecuteInput,
  ImageProviderRegistry,
} from './providers/image-provider.registry';

export type CustomByokImageInput = {
  credentialId: string;
  provider: string;
  model: string;
  /** OpenAI: generations | edits. Ignored for replicate (uses image presence). */
  mode?: 'generations' | 'edits';
  /** Optional Replicate version hash. */
  version?: string;
  prompt?: string;
  image?: Express.Multer.File;
};

@Injectable()
export class AiOperationsExecuteService {
  constructor(
    private readonly catalog: AiOperationsCatalogService,
    private readonly providers: ImageProviderRegistry,
    private readonly credits: CreditService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentials: AiCredentialsService,
    private readonly galleryStorage: AiGalleryStorageService,
  ) {}

  /**
   * BYOK-only image run that does not require an admin catalog type/variant.
   * User picks provider model from their own account (or pastes a Replicate model id).
   */
  async executeCustom(userId: string, dto: CustomByokImageInput) {
    const provider = dto.provider.trim().toLowerCase();
    if (!isByokImageProvider(provider)) {
      throw new BadRequestException({
        code: 'BYOK_NOT_SUPPORTED',
        message: `Provider "${provider}" does not support custom user-key image runs`,
      });
    }
    const model = dto.model.trim();
    if (!model) {
      throw new BadRequestException({
        code: 'MODEL_REQUIRED',
        message: 'Model is required',
      });
    }
    const input: ImageExecuteInput = {
      image: dto.image,
      prompt: dto.prompt,
    };
    const mode =
      dto.mode === 'edits' || dto.mode === 'generations'
        ? dto.mode
        : input.image
          ? 'edits'
          : 'generations';
    this.assertPromptImageInput(provider, mode, input);

    const synthetic = {
      id: randomUUID(),
      provider,
      externalModel: model,
      creditCost: 0,
      configJson: {
        mode,
        ...(dto.version?.trim() ? { version: dto.version.trim() } : {}),
      },
    } as unknown as AiProviderVariant;

    return this.runImageJob({
      userId,
      typeSlug: 'custom-byok',
      variant: synthetic,
      variantIdForDb: null,
      input,
      credentialId: dto.credentialId,
    });
  }

  async execute(
    userId: string,
    typeSlug: string,
    variantId: string | undefined,
    input: ImageExecuteInput,
    credentialId?: string,
  ) {
    const variant = await this.catalog.resolveVariant(typeSlug, variantId);

    if (credentialId && !isByokImageProvider(variant.provider)) {
      throw new BadRequestException({
        code: 'BYOK_NOT_SUPPORTED',
        message: `Provider "${variant.provider}" does not support user API keys for this operation`,
      });
    }

    const config =
      variant.configJson && typeof variant.configJson === 'object'
        ? (variant.configJson as Record<string, unknown>)
        : {};
    const mode =
      config.mode === 'edits' || config.mode === 'generations'
        ? config.mode
        : input.image
          ? 'edits'
          : 'generations';
    this.assertPromptImageInput(variant.provider, mode, input);

    return this.runImageJob({
      userId,
      typeSlug,
      variant,
      variantIdForDb: variant.id,
      input,
      credentialId,
    });
  }

  private assertPromptImageInput(
    provider: string,
    mode: string,
    input: ImageExecuteInput,
  ) {
    const normalized = provider.toLowerCase();
    if (normalized !== 'openai' && normalized !== 'google') return;
    const label = normalized === 'google' ? 'Google' : 'OpenAI';
    if (!input.prompt?.trim()) {
      throw new BadRequestException({
        code: 'PROMPT_REQUIRED',
        message: `A non-empty prompt is required for ${label} image operations`,
      });
    }
    if (mode === 'edits' && !input.image) {
      throw new BadRequestException({
        code: 'IMAGE_REQUIRED',
        message: `An input image is required for ${label} image edits`,
      });
    }
  }

  private async runImageJob(params: {
    userId: string;
    typeSlug: string;
    variant: AiProviderVariant;
    variantIdForDb: string | null;
    input: ImageExecuteInput;
    credentialId?: string;
  }) {
    const { userId, typeSlug, variant, variantIdForDb, input, credentialId } =
      params;

    const resolved = credentialId
      ? await this.credentials.resolveForRequest(
          userId,
          credentialId,
          variant.provider,
        )
      : undefined;
    const billingMode = resolved
      ? AiBillingMode.USER_KEY
      : AiBillingMode.PLATFORM_CREDITS;
    const chargingEnabled =
      billingMode === AiBillingMode.PLATFORM_CREDITS &&
      this.config.get('AI_CREDIT_CHARGING_ENABLED', 'true') !== 'false';
    const cost = resolved ? 0 : variant.creditCost;
    const operationKey = `ai-op:${userId}:${randomUUID()}`;

    const reservation = chargingEnabled
      ? await this.credits.reserveCredits(
          userId,
          cost,
          `${operationKey}:reserve`,
          'AI_OPERATION',
          operationKey,
        )
      : undefined;

    const startedAt = new Date();
    const record = await this.prisma.aiRequest.create({
      data: {
        userId,
        credentialId: resolved?.credential.id,
        billingMode,
        provider: variant.provider,
        model: variant.externalModel,
        operation: AiOperation.IMAGE_GENERATION,
        status: AiRequestStatus.PROCESSING,
        inputHash: randomUUID().replace(/-/g, ''),
        estimatedCreditCost: cost,
        creditReservationId: reservation?.id,
        variantId: variantIdForDb ?? undefined,
        startedAt,
        inputJson: {
          type: typeSlug,
          variantId: variantIdForDb,
          customByok: typeSlug === 'custom-byok',
          hasImage: Boolean(input.image),
          prompt: input.prompt ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    try {
      const adapter = this.providers.get(variant.provider);
      const result = await adapter.execute(
        variant,
        input,
        resolved ? { apiKey: resolved.apiKey } : undefined,
      );
      if (reservation) {
        await this.credits.captureReservation(
          userId,
          reservation.id,
          cost,
          `${operationKey}:capture`,
        );
      }
      if (resolved)
        await this.credentials
          .markUsed(resolved.credential.id)
          .catch(() => undefined);

      const persisted = await this.galleryStorage.persistCompletedAssets({
        userId,
        requestId: record.id,
        input,
        outputImageUrl: result.imageUrl,
      });

      const inputJson: Record<string, unknown> = {
        type: typeSlug,
        variantId: variantIdForDb,
        customByok: typeSlug === 'custom-byok',
        hasImage: Boolean(input.image),
        prompt: input.prompt ?? null,
      };
      if (persisted.input) {
        inputJson.inputStorageKey = persisted.input.storageKey;
        inputJson.inputContentType = persisted.input.contentType;
      }

      const imageUrl = persisted.output?.signedUrl ?? result.imageUrl;
      const outputJson: Record<string, unknown> = {
        imageUrl,
      };
      if (persisted.output) {
        outputJson.storageKey = persisted.output.storageKey;
        outputJson.contentType = persisted.output.contentType;
      }

      const completedAt = new Date();
      await this.prisma.aiRequest.update({
        where: { id: record.id },
        data: {
          status: AiRequestStatus.COMPLETED,
          inputJson: inputJson as Prisma.InputJsonValue,
          outputJson: outputJson as Prisma.InputJsonValue,
          providerRequestId: result.providerRequestId,
          chargedCreditAmount: cost,
          actualCreditCost: cost,
          creditChargedAt: resolved ? undefined : completedAt,
          completedAt,
          latencyMs: completedAt.getTime() - startedAt.getTime(),
        },
      });
      return {
        requestId: record.id,
        type: typeSlug,
        variantId: variantIdForDb ?? undefined,
        provider: variant.provider,
        model: variant.externalModel,
        imageUrl,
        creditCost: formatCreditAmount(cost),
      };
    } catch (error) {
      if (reservation) {
        await this.credits
          .releaseReservation(userId, reservation.id, `${operationKey}:release`)
          .catch(() => undefined);
      }
      const message = redactSecrets(
        error instanceof Error ? error.message : 'Provider failed',
      ).slice(0, 500);
      if (resolved) {
        // Only invalidate the user's key for auth-like provider failures.
        await (isProviderAuthError(error)
          ? this.credentials.markUsed(resolved.credential.id, message)
          : this.credentials.markUsed(resolved.credential.id)
        ).catch(() => undefined);
      }
      await this.prisma.aiRequest.update({
        where: { id: record.id },
        data: {
          status: AiRequestStatus.FAILED,
          errorCode: 'AI_PROVIDER_FAILED',
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
}
