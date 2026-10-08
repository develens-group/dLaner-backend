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
  it('does not enqueue the access-log timestamp', () => {
    const enqueue = jest.fn();
    const middleware = new RequestTrackingMiddleware(
      { enqueue } as never,
      new ConfigService(),
    );
    let finish: (() => void) | undefined;
    const request = {
      get: jest.fn((header: string) =>
        header === 'x-request-id' ? 'client-request_123' : undefined,
      ),
      method: 'GET',
      originalUrl: '/api/v1/test?value=1',
      path: '/api/v1/test',
      baseUrl: '/api/v1',
      route: { path: '/test' },
      query: { value: '1' },
      body: undefined,
      ip: '127.0.0.1',
    };
    const response = {
      locals: {},
      statusCode: 200,
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      once: jest.fn((_event: string, callback: () => void) => {
        finish = callback;
      }),
    };

    middleware.use(request as never, response as never, jest.fn());
    finish?.();

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'client-request_123',
        route: '/api/v1/test',
        path: '/api/v1/test',
      }),
    );
    expect(enqueue.mock.calls[0][0]).not.toHaveProperty('timestamp');
  });
});
