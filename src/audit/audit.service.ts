import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}
  record(
    action: string,
    actorId: string | undefined,
    targetId: string | undefined,
    targetType = 'User',
    metadata?: Prisma.InputJsonValue,
  ) {
    this.logger.log(
      JSON.stringify({
        action,
        actorId,
        targetId,
        occurredAt: new Date().toISOString(),
      }),
    );
    void this.prisma.auditLog
      .create({ data: { action, actorId, targetId, targetType, metadata } })
      .catch((error: unknown) =>
        this.logger.error(
          JSON.stringify({
            event: 'audit_persistence_failed',
            action,
            error: error instanceof Error ? error.name : 'UnknownError',
          }),
        ),
      );
  }

  async list(query: {
    page: number;
    limit: number;
    action?: string;
    actorId?: string;
    targetType?: string;
    targetId?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit) || 0,
      },
    };
  }
}
