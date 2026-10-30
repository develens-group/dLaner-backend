import type { Request, Response } from 'express';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

type JsonRpcError = {
  jsonrpc: string;
  error: { code: number; message: string };
};

const response = () => {
  const res = {
    setHeader: jest.fn<unknown, [string, string]>(),
    status: jest.fn<unknown, [number]>(),
    type: jest.fn<unknown, [string]>(),
    send: jest.fn<unknown, [string]>(),
    json: jest.fn<unknown, [unknown]>(),
  };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    method: 'GET',
    headers: { host: 'api.dlander.test' },
    protocol: 'https',
    originalUrl: '/mcp',
    ...overrides,
  }) as unknown as Request;

const controller = () =>
  new McpController(
    { assertEnabled: jest.fn() } as unknown as McpService,
    {
      get: (key: string) =>
        key === 'MCP_EDITOR_URL' ? 'https://app.dlander.test/' : undefined,
    } as never,
  );

describe('GET /mcp in a browser', () => {
  it('explains the endpoint instead of showing the JSON-RPC error', async () => {
    const res = response();

    await controller().handle(
      request({ headers: { host: 'api.dlander.test', accept: 'text/html' } }),
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('html');
    const html = res.send.mock.calls[0][0];
    expect(html).toContain('Streamable HTTP');
    expect(html).toContain('https://api.dlander.test/mcp');
    expect(html).toContain('https://app.dlander.test/connect/ai');
  });

  it('keeps the JSON-RPC error for non-browser callers', async () => {
    const res = response();

    await controller().handle(
      request({
        headers: { host: 'api.dlander.test', accept: 'application/json' },
      }),
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(405);
    const body = res.json.mock.calls[0][0] as JsonRpcError;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.message).toBe('Use POST; this server is stateless');
  });
});
