import { BadRequestException } from '@nestjs/common';
import { ApiRequestsService } from './api-requests.service';

describe('ApiRequestsService usage filters', () => {
  const service = new ApiRequestsService({} as never, {} as never);
  const where = (query: Record<string, unknown>, defaultPeriod = false) =>
    (
      service as unknown as {
        where(query: Record<string, unknown>, defaultPeriod: boolean): unknown;
      }
    ).where(query, defaultPeriod);
  const validate = (query: Record<string, unknown>) =>
    (
      service as unknown as {
        validateRange(query: Record<string, unknown>): void;
      }
    ).validateRange(query);

  it('maps server errors and authenticated users to database filters', () => {
    expect(
      where({ outcome: 'server-error', authenticated: true }),
    ).toMatchObject({
      statusCode: { gte: 500, lt: 600 },
      userId: { not: null },
    });
  });

  it('uses a bounded default period for usage reports', () => {
    expect(where({}, true)).toMatchObject({
      createdAt: { gte: expect.any(Date) },
    });
  });

  it('rejects reversed date and duration ranges', () => {
    expect(() => validate({ from: '2026-02-01', to: '2026-01-01' })).toThrow(
      BadRequestException,
    );
    expect(() => validate({ minDurationMs: 10, maxDurationMs: 5 })).toThrow(
      'minDurationMs must not exceed maxDurationMs',
    );
  });
});
