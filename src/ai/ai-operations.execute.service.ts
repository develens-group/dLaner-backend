import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiOperation, AiRequestStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CreditService } from '../credits/credit.service';
import { formatCreditAmount } from '../credits/credit-units';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  async execute(
    userId: string,
    typeSlug: string,
    variantId: string | undefined,
    input: ImageExecuteInput,
  ) {
    const variant = await this.catalog.resolveVariant(typeSlug, variantId);
    const chargingEnabled =
      this.config.get('AI_CREDIT_CHARGING_ENABLED', 'true') !== 'false';
    const cost = variant.creditCost;
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
      const result = await adapter.execute(variant, input);
      if (reservation) {
        await this.credits.captureReservation(
          userId,
          reservation.id,
          cost,
          `${operationKey}:capture`,
        );
      }
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
          creditChargedAt: completedAt,
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
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Provider failed';
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
