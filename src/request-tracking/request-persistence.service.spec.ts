import { ConfigService } from '@nestjs/config';
import { ApiRequestSource } from '@prisma/client';
import { RequestPersistenceService } from './request-persistence.service';

describe('RequestPersistenceService', () => {
  const record = {
    requestId: 'request-12345678',
    method: 'GET',
    route: '/test',
    path: '/test',
    bodyCaptured: false,
    bodyTruncated: false,
    bodyRedacted: false,
    statusCode: 200,
    durationMs: 4,
    source: ApiRequestSource.UNKNOWN,
  };
  it('uses idempotent upsert and retries transient failures', async () => {
    const upsert = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({});
    const prisma = { apiRequestRecord: { upsert } };
    const config = new ConfigService({
      API_REQUEST_STORAGE_ENABLED: 'true',
      API_REQUEST_PERSISTENCE_MODE: 'buffered',
    });
    const service = new RequestPersistenceService(prisma as never, config);
    service.enqueue(record);
    await service.flush();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { requestId: record.requestId },
        update: {},
      }),
    );
  });
  it('supports deterministic synchronous test mode', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const config = new ConfigService({
      API_REQUEST_STORAGE_ENABLED: 'true',
      API_REQUEST_PERSISTENCE_MODE: 'sync',
    });
    const service = new RequestPersistenceService(
      { apiRequestRecord: { upsert } } as never,
      config,
    );
    service.enqueue(record);
    await new Promise((resolve) => setImmediate(resolve));
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
