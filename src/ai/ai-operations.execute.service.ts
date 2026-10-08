import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiBillingMode,
  AiOperation,
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
import { AiOperationsCatalogService } from './ai-operations.catalog';
import {
  ImageExecuteInput,
  ImageProviderRegistry,
} from './providers/image-provider.registry';

@Injectable()
export class AiOperationsExecuteService {
  constructor(
    private readonly catalog: AiOperationsCatalogService,
    private readonly providers: ImageProviderRegistry,
    private readonly credits: CreditService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentials: AiCredentialsService,
  ) {}

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

    if (variant.provider === 'openai' && !input.prompt?.trim()) {
      throw new BadRequestException({
        code: 'PROMPT_REQUIRED',
        message: 'A non-empty prompt is required for OpenAI image generation',
      });
    }

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
        variantId: variant.id,
        startedAt,
        inputJson: {
          type: typeSlug,
          variantId: variant.id,
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
      const completedAt = new Date();
      await this.prisma.aiRequest.update({
        where: { id: record.id },
        data: {
          status: AiRequestStatus.COMPLETED,
          outputJson: {
            imageUrl: result.imageUrl,
          } as Prisma.InputJsonValue,
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
        variantId: variant.id,
        provider: variant.provider,
        model: variant.externalModel,
        imageUrl: result.imageUrl,
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
