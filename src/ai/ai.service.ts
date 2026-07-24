import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  sanitizePayload,
  stablePayloadHash,
} from '../request-tracking/sanitizer';
import { AiExecutionResult, AiProviderError } from './ai-provider';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiRequestQueryDto, CreateAiRequestDto } from './ai.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderRegistry,
    private readonly config: ConfigService,
  ) {}
  async createAndExecute(
    userId: string,
    requestId: string | undefined,
    key: string | undefined,
    dto: CreateAiRequestDto,
  ) {
    if (key && !/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new BadRequestException('Invalid Idempotency-Key');
    const inputHash = stablePayloadHash(dto.input);
    if (key) {
      const existing = await this.prisma.aiRequest.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      if (existing) {
        if (existing.inputHash !== inputHash)
          throw new ConflictException(
            'Idempotency key was used with different input',
          );
        return existing;
      }
    }
    const input = this.capture(dto.input, 'INPUT');
    const record = await this.prisma.aiRequest.create({
      data: {
        userId,
        requestId,
        idempotencyKey: key,
        provider: dto.provider.toLowerCase(),
        model: dto.model,
        operation: dto.operation,
        inputHash,
        inputJson: input.value as Prisma.InputJsonValue,
        inputOmitted: !input.captured,
        inputTruncated: input.truncated,
        inputRedacted: input.redacted,
        status: AiRequestStatus.QUEUED,
        startedAt: new Date(),
      },
    });
    await this.prisma.aiRequest.update({
      where: { id: record.id },
      data: { status: AiRequestStatus.PROCESSING },
    });
    const started = Date.now();
    try {
      const result = await this.withTimeout(
        this.providers.get(dto.provider).execute({
          model: dto.model,
          operation: dto.operation,
          input: dto.input,
        }),
      );
      return this.complete(record.id, result, Date.now() - started);
    } catch (error) {
      const normalized = normalizeError(error);
      await this.prisma.aiRequest.update({
        where: { id: record.id },
        data: {
          status: AiRequestStatus.FAILED,
          completedAt: new Date(),
          latencyMs: Date.now() - started,
          errorCode: normalized.code,
          errorMessage: normalized.message.slice(0, 500),
        },
      });
      if (error instanceof RequestTimeoutException) throw error;
      throw new BadRequestException('AI provider request failed');
    }
  }
  async list(userId: string | undefined, query: AiRequestQueryDto) {
    const where: Prisma.AiRequestWhereInput = {
      userId,
      status: query.status,
      operation: query.operation,
      provider: query.provider,
      model: query.model,
      createdAt:
        query.from || query.to
          ? {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            }
          : undefined,
    };
    const items = await this.prisma.aiRequest.findMany({
      where,
      take: query.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: safeAiSelect,
    });
    const hasMore = items.length > query.limit;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }
  async get(id: string, userId?: string) {
    const record = await this.prisma.aiRequest.findFirst({
      where: { id, userId },
      select: safeAiSelect,
    });
    if (!record) throw new NotFoundException('AI request not found');
    return record;
  }
  async cancel(id: string, userId?: string) {
    const record = await this.prisma.aiRequest.findFirst({
      where: { id, userId },
    });
    if (!record) throw new NotFoundException('AI request not found');
    if (
      record.status !== AiRequestStatus.CREATED &&
      record.status !== AiRequestStatus.QUEUED
    )
      throw new ConflictException('AI request can no longer be cancelled');
    const changed = await this.prisma.aiRequest.updateMany({
      where: {
        id,
        status: { in: [AiRequestStatus.CREATED, AiRequestStatus.QUEUED] },
      },
      data: { status: AiRequestStatus.CANCELLED, completedAt: new Date() },
    });
    if (!changed.count)
      throw new ConflictException('AI request can no longer be cancelled');
    return this.get(id, userId);
  }
  async stats() {
    const [total, statuses, usage] = await this.prisma.$transaction([
      this.prisma.aiRequest.count(),
      this.prisma.aiRequest.groupBy({
        by: ['status'],
        _count: { status: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.aiRequest.aggregate({
        _sum: { totalTokens: true },
        _avg: { latencyMs: true },
      }),
    ]);
    return {
      total,
      statusDistribution: statuses,
      totalTokens: usage._sum.totalTokens ?? 0,
      averageLatencyMs: usage._avg.latencyMs ?? 0,
    };
  }
  async cleanup(
    retentionDays = this.config.get<number>('AI_HISTORY_RETENTION_DAYS', 90),
  ) {
    return this.prisma.aiRequest.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - retentionDays * 86_400_000) },
      },
    });
  }
  private capture(value: unknown, kind: 'INPUT' | 'OUTPUT') {
    if (this.config.get(`AI_HISTORY_STORE_${kind}`, 'true') !== 'true')
      return {
        value: null,
        captured: false,
        truncated: false,
        redacted: false,
      };
    return sanitizePayload(
      value,
      this.config.get<number>(`AI_HISTORY_MAX_${kind}_BYTES`, 32_768),
    );
  }
  private async complete(
    id: string,
    result: AiExecutionResult,
    latencyMs: number,
  ) {
    const output = this.capture(result.output, 'OUTPUT');
    return this.prisma.aiRequest.update({
      where: { id },
      data: {
        status: AiRequestStatus.COMPLETED,
        completedAt: new Date(),
        latencyMs,
        outputJson: output.value as Prisma.InputJsonValue,
        outputOmitted: !output.captured,
        outputTruncated: output.truncated,
        outputRedacted: output.redacted,
        providerRequestId: result.providerRequestId,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
      },
      select: safeAiSelect,
    });
  }
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = this.config.get<number>('AI_PROVIDER_TIMEOUT_MS', 30_000);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new RequestTimeoutException('AI provider timed out')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
function normalizeError(error: unknown) {
  if (error instanceof AiProviderError)
    return { code: error.code, message: error.message };
  if (error instanceof RequestTimeoutException)
    return { code: 'PROVIDER_TIMEOUT', message: 'AI provider timed out' };
  return { code: 'PROVIDER_ERROR', message: 'AI provider request failed' };
}
export const safeAiSelect = {
  id: true,
  requestId: true,
  userId: true,
  provider: true,
  model: true,
  operation: true,
  status: true,
  inputJson: true,
  inputHash: true,
  inputOmitted: true,
  inputTruncated: true,
  inputRedacted: true,
  outputJson: true,
  outputOmitted: true,
  outputTruncated: true,
  outputRedacted: true,
  providerRequestId: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  estimatedCreditCost: true,
  chargedCreditAmount: true,
  latencyMs: true,
  errorCode: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
