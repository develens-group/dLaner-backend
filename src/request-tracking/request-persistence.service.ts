import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RequestRecordInput } from './request-record.types';

@Injectable()
export class RequestPersistenceService implements OnApplicationShutdown {
  private readonly logger = new Logger(RequestPersistenceService.name);
  private readonly queue: RequestRecordInput[] = [];
  private processing = false;
  private readonly maxQueue: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.maxQueue = this.config.get<number>('API_REQUEST_QUEUE_MAX_SIZE', 1000);
  }
  enqueue(record: RequestRecordInput) {
    if (this.config.get('API_REQUEST_STORAGE_ENABLED', 'true') !== 'true')
      return;
    if (
      this.config.get('API_REQUEST_PERSISTENCE_MODE', 'buffered') === 'sync'
    ) {
      void this.persistWithRetry(record);
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      this.logger.error(
        JSON.stringify({
          event: 'api_request_buffer_full',
          requestId: record.requestId,
          fallback: 'synchronous',
        }),
      );
      void this.persistWithRetry(record);
      return;
    }
    this.queue.push(record);
    this.schedule();
  }
  async flush() {
    while (this.queue.length) {
      const item = this.queue.shift();
      if (item) await this.persistWithRetry(item);
    }
  }
  async cleanup(
    retentionDays = this.config.get<number>('API_REQUEST_RETENTION_DAYS', 30),
  ) {
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    return this.prisma.apiRequestRecord.deleteMany({
      where: { createdAt: { lt: before } },
    });
  }
  async onApplicationShutdown() {
    await this.flush();
  }
  private schedule() {
    if (this.processing) return;
    this.processing = true;
    setImmediate(() => void this.process());
  }
  private async process() {
    try {
      await this.flush();
    } finally {
      this.processing = false;
      if (this.queue.length) this.schedule();
    }
  }
  private async persistWithRetry(record: RequestRecordInput) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.prisma.apiRequestRecord.upsert({
          where: { requestId: record.requestId },
          create: record,
          update: {},
        });
        return;
      } catch (error) {
        if (attempt === 3) {
          this.logger.error(
            JSON.stringify({
              event: 'api_request_persistence_failed',
              requestId: record.requestId,
              attempts: attempt,
              error: error instanceof Error ? error.name : 'UnknownError',
            }),
          );
          return;
        }
      }
    }
  }
}
