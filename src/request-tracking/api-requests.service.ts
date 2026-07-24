import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiRequestQueryDto } from './api-requests.dto';

@Injectable()
export class ApiRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async list(query: ApiRequestQueryDto) {
    const where = this.where(query);
    const items = await this.prisma.apiRequestRecord.findMany({
      where,
      take: query.limit + 1,
      orderBy: [{ createdAt: query.order }, { id: query.order }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: safeSelect,
    });
    const hasMore = items.length > query.limit;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }
  async get(requestId: string, actorId: string) {
    const item = await this.prisma.apiRequestRecord.findUnique({
      where: { requestId },
      select: safeSelect,
    });
    if (!item) throw new NotFoundException('API request record not found');
    this.audit.record(
      'api_request.detail_viewed',
      actorId,
      requestId,
      'ApiRequestRecord',
    );
    return item;
  }
  async stats(query: ApiRequestQueryDto) {
    const where = this.where(query);
    const [total, errors, aggregate, statuses, routes] =
      await this.prisma.$transaction([
        this.prisma.apiRequestRecord.count({ where }),
        this.prisma.apiRequestRecord.count({
          where: { ...where, statusCode: { gte: 400 } },
        }),
        this.prisma.apiRequestRecord.aggregate({
          where,
          _avg: { durationMs: true },
        }),
        this.prisma.apiRequestRecord.groupBy({
          by: ['statusCode'],
          where,
          _count: true,
          orderBy: { statusCode: 'asc' },
          take: 100,
        }),
        this.prisma.apiRequestRecord.groupBy({
          by: ['route'],
          where,
          _count: true,
          orderBy: { _count: { route: 'desc' } },
          take: 20,
        }),
      ]);
    const durations = await this.prisma.apiRequestRecord.findMany({
      where,
      select: { durationMs: true },
      orderBy: { durationMs: 'asc' },
      take: 10_000,
    });
    return {
      total,
      errorRate: total ? errors / total : 0,
      averageDurationMs: aggregate._avg.durationMs ?? 0,
      p95DurationMs: durations.length
        ? durations[Math.ceil(durations.length * 0.95) - 1].durationMs
        : 0,
      statusDistribution: statuses.map((x) => ({
        statusCode: x.statusCode,
        count: x._count,
      })),
      topRoutes: routes.map((x) => ({ route: x.route, count: x._count })),
      sampleLimited: total > 10_000,
    };
  }
  private where(query: ApiRequestQueryDto): Prisma.ApiRequestRecordWhereInput {
    const statusCode =
      query.statusCode ??
      (query.minStatusCode ? { gte: query.minStatusCode } : undefined);
    return {
      userId: query.userId,
      route: query.route,
      method: query.method,
      statusCode,
      errorCode: query.errorCode,
      source: query.source,
      requestId: query.requestId,
      createdAt:
        query.from || query.to
          ? {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            }
          : undefined,
    };
  }
}

const safeSelect = {
  id: true,
  requestId: true,
  userId: true,
  sessionId: true,
  method: true,
  route: true,
  path: true,
  queryJson: true,
  requestBodyJson: true,
  responseSummaryJson: true,
  bodyCaptured: true,
  bodyTruncated: true,
  bodyRedacted: true,
  statusCode: true,
  durationMs: true,
  ipAddress: true,
  userAgent: true,
  contentLength: true,
  responseLength: true,
  errorCode: true,
  errorMessage: true,
  source: true,
  createdAt: true,
} as const;
