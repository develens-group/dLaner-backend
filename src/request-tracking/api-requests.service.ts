import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  async usage(query: ApiRequestQueryDto, actorId: string) {
    this.validateRange(query);
    const where = this.where(query, true);
    const [
      total,
      errors,
      aggregate,
      methods,
      sources,
      statuses,
      routes,
      users,
    ] = await this.prisma.$transaction([
      this.prisma.apiRequestRecord.count({ where }),
      this.prisma.apiRequestRecord.count({
        where: { ...where, statusCode: { gte: 400 } },
      }),
      this.prisma.apiRequestRecord.aggregate({
        where,
        _avg: { durationMs: true },
        _sum: {
          durationMs: true,
          contentLength: true,
          responseLength: true,
        },
      }),
      this.prisma.apiRequestRecord.groupBy({
        by: ['method'],
        where,
        _count: true,
        orderBy: { _count: { method: 'desc' } },
      }),
      this.prisma.apiRequestRecord.groupBy({
        by: ['source'],
        where,
        _count: true,
        orderBy: { _count: { source: 'desc' } },
      }),
      this.prisma.apiRequestRecord.groupBy({
        by: ['statusCode'],
        where,
        _count: true,
        orderBy: { statusCode: 'asc' },
      }),
      this.prisma.apiRequestRecord.groupBy({
        by: ['route'],
        where,
        _count: true,
        _sum: { responseLength: true },
        _avg: { durationMs: true },
        orderBy: { _count: { route: 'desc' } },
        take: 20,
      }),
      this.prisma.apiRequestRecord.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: true,
        _sum: { responseLength: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 20,
      }),
    ]);
    const userIds = users.flatMap((item) =>
      item.userId === null ? [] : [item.userId],
    );
    const [userDetails, anonymousRequests, activeUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true, plan: true },
      }),
      this.prisma.apiRequestRecord.count({
        where: { ...where, userId: null },
      }),
      this.prisma.apiRequestRecord.findMany({
        where: { ...where, userId: { not: null } },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    const usersById = new Map(userDetails.map((user) => [user.id, user]));
    this.audit.record(
      'api_request.usage_viewed',
      actorId,
      undefined,
      'ApiRequestRecord',
      { filters: this.auditFilters(query) },
    );
    return {
      period: {
        from:
          query.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString(),
        to: query.to ?? new Date().toISOString(),
      },
      summary: {
        totalRequests: total,
        successfulRequests: total - errors,
        failedRequests: errors,
        errorRate: total ? errors / total : 0,
        activeUsers: activeUsers.length,
        anonymousRequests,
        averageDurationMs: aggregate._avg.durationMs ?? 0,
        totalDurationMs: aggregate._sum.durationMs ?? 0,
        requestBytes: aggregate._sum.contentLength ?? 0,
        responseBytes: aggregate._sum.responseLength ?? 0,
        totalTransferBytes:
          (aggregate._sum.contentLength ?? 0) +
          (aggregate._sum.responseLength ?? 0),
      },
      byMethod: methods.map((item) => ({
        method: item.method,
        count: item._count,
      })),
      bySource: sources.map((item) => ({
        source: item.source,
        count: item._count,
      })),
      byStatus: statuses.map((item) => ({
        statusCode: item.statusCode,
        count: item._count,
      })),
      topRoutes: routes.map((item) => ({
        route: item.route,
        count: item._count,
        responseBytes: item._sum?.responseLength ?? 0,
        averageDurationMs: item._avg?.durationMs ?? 0,
      })),
      topUsers: users.map((item) => ({
        user: item.userId ? usersById.get(item.userId) : undefined,
        count: item._count,
        responseBytes: item._sum?.responseLength ?? 0,
      })),
    };
  }
  private where(
    query: ApiRequestQueryDto,
    defaultPeriod = false,
  ): Prisma.ApiRequestRecordWhereInput {
    const statusCode =
      query.statusCode ??
      (query.outcome
        ? outcomeRange[query.outcome]
        : query.minStatusCode
          ? { gte: query.minStatusCode }
          : undefined);
    return {
      userId:
        query.authenticated === true
          ? (query.userId ?? { not: null })
          : query.authenticated === false
            ? null
            : query.userId,
      route:
        query.route ??
        (query.routeContains
          ? { contains: query.routeContains, mode: 'insensitive' }
          : undefined),
      method: query.method,
      statusCode,
      durationMs:
        query.minDurationMs !== undefined || query.maxDurationMs !== undefined
          ? {
              gte: query.minDurationMs,
              lte: query.maxDurationMs,
            }
          : undefined,
      errorCode: query.errorCode,
      source: query.source,
      requestId: query.requestId,
      createdAt:
        query.from || query.to || defaultPeriod
          ? {
              gte: query.from
                ? new Date(query.from)
                : defaultPeriod
                  ? new Date(Date.now() - 30 * 86_400_000)
                  : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
  }
  private auditFilters(query: ApiRequestQueryDto) {
    const { cursor: _cursor, ...filters } = query;
    return filters;
  }
  private validateRange(query: ApiRequestQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException('from must be before to');
    if (
      query.minDurationMs !== undefined &&
      query.maxDurationMs !== undefined &&
      query.minDurationMs > query.maxDurationMs
    )
      throw new BadRequestException(
        'minDurationMs must not exceed maxDurationMs',
      );
  }
}

const outcomeRange = {
  success: { gte: 200, lt: 300 },
  redirect: { gte: 300, lt: 400 },
  'client-error': { gte: 400, lt: 500 },
  'server-error': { gte: 500, lt: 600 },
} as const;

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
