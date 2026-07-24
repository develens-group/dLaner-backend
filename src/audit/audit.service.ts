import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  record(action: string, actorId: string, targetId: string) {
    this.logger.log(
      JSON.stringify({
        action,
        actorId,
        targetId,
        occurredAt: new Date().toISOString(),
      }),
    );
  }
}
