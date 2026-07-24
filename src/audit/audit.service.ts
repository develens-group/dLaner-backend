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
}
