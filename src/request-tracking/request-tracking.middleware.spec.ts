import { resolveRequestId } from './request-tracking.middleware';
import { ConfigService } from '@nestjs/config';
import { RequestTrackingMiddleware } from './request-tracking.middleware';

describe('request ID handling', () => {
  it('accepts a well-formed incoming request ID', () => {
    expect(resolveRequestId('client-request_123')).toBe('client-request_123');
  });
  it.each(['short', 'contains spaces and secrets', '../invalid', ''])(
    'replaces malformed incoming ID %p',
    (incoming) => {
      expect(resolveRequestId(incoming)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );
  it('generates unique request IDs', () => {
    expect(resolveRequestId()).not.toBe(resolveRequestId());
  });
  it('returns the request ID in the response before continuing', () => {
    const middleware = new RequestTrackingMiddleware(
      { enqueue: jest.fn() } as never,
      new ConfigService(),
    );
    const setHeader = jest.fn();
    const request = {
      get: jest.fn().mockReturnValue('client-request_123'),
    };
    const response = { setHeader, once: jest.fn() };
    const next = jest.fn();
    middleware.use(request as never, response as never, next);
    expect(setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'client-request_123',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
