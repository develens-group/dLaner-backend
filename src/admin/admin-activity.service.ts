import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityType } from './admin.dto';

export type ActivityItem = {
  id: string;
  type: ActivityType;
  occurredAt: string;
  summary: string;
  metadata: Record<string, unknown>;
};

const ALL_TYPES: ActivityType[] = [
  'audit',
  'credit',
  'api_request',
  'ai_request',
  'session',
];

@Injectable()
export class AdminActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: { limit?: number; cursor?: string; types?: ActivityType[] },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const limit = query.limit ?? 30;
    const types = new Set(query.types?.length ? query.types : ALL_TYPES);
    const take = limit + 1;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const buckets: ActivityItem[] = [];

    if (types.has('audit')) {
      const rows = await this.prisma.auditLog.findMany({
        where: { targetType: 'User', targetId: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'audit',
          occurredAt: row.createdAt.toISOString(),
          summary: row.action,
          metadata: {
            actorId: row.actorId,
            targetType: row.targetType,
            targetId: row.targetId,
            metadata: row.metadata,
          },
        });
      }
    }

    if (types.has('credit')) {
      const rows = await this.prisma.creditLedgerEntry.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'credit',
          occurredAt: row.createdAt.toISOString(),
          summary: `${row.type} ${row.amount}`,
          metadata: {
            type: row.type,
            amount: row.amount,
            description: row.description,
          },
        });
      }
    }

    if (types.has('api_request')) {
      const rows = await this.prisma.apiRequestRecord.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'api_request',
          occurredAt: row.createdAt.toISOString(),
          summary: `${row.method} ${row.route} → ${row.statusCode}`,
          metadata: {
            requestId: row.requestId,
            method: row.method,
            route: row.route,
            statusCode: row.statusCode,
            durationMs: row.durationMs,
          },
        });
      }
    }

    if (types.has('ai_request')) {
      const rows = await this.prisma.aiRequest.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'ai_request',
          occurredAt: row.createdAt.toISOString(),
          summary: `${row.provider}/${row.model} ${row.status}`,
          metadata: {
            provider: row.provider,
            model: row.model,
            status: row.status,
            operation: row.operation,
            chargedCreditAmount: row.chargedCreditAmount,
          },
        });
      }
    }

    if (types.has('session')) {
      const rows = await this.prisma.session.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      });
      for (const row of rows) {
        buckets.push({
          id: row.id,
          type: 'session',
          occurredAt: row.createdAt.toISOString(),
          summary: `session ${row.clientType}`,
          metadata: {
            clientType: row.clientType,
            ipAddress: row.ipAddress,
            userAgent: row.userAgent,
            revokedAt: row.revokedAt,
          },
        });
      }
    }

    buckets.sort((a, b) => {
      const t = b.occurredAt.localeCompare(a.occurredAt);
      if (t !== 0) return t;
      return b.id.localeCompare(a.id);
    });

    let filtered = buckets;
    if (cursor) {
      filtered = buckets.filter((item) => {
        if (item.occurredAt < cursor.t) return true;
        if (item.occurredAt > cursor.t) return false;
        if (item.id < cursor.id) return true;
        if (item.id > cursor.id) return false;
        return item.type < cursor.type;
      });
    }

    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const last = page[page.length - 1];
    return {
      items: page,
      meta: {
        limit,
        nextCursor:
          hasMore && last
            ? this.encodeCursor({
                t: last.occurredAt,
                id: last.id,
                type: last.type,
              })
            : null,
      },
    };
  }

  private encodeCursor(c: { t: string; id: string; type: string }) {
    return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
  }

  private decodeCursor(raw: string): { t: string; id: string; type: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as { t: string; id: string; type: string };
      if (!parsed?.t || !parsed?.id || !parsed?.type) {
        throw new Error('bad');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid activity cursor');
    }
  }
}
