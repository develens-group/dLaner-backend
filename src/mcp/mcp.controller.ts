import {
  All,
  BadRequestException,
  Controller,
  Get,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Public } from '../common/decorators';
import { McpService } from './mcp.service';
import { sceneShape } from './scene-schema';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The MCP SDK rejects POSTs whose `Accept` header does not list both
 * `application/json` and `text/event-stream` with a 406. Several real clients
 * (ChatGPT's connector validator among them) send only `application/json`, or
 * no `Accept` at all, so the handshake never starts and the client reports a
 * generic "settings were rejected" error.
 *
 * We always answer with JSON (`enableJsonResponse`), so widening the header
 * here is safe: the SDK uses it only for this validation, not to pick a
 * response format.
 */
export const ensureMcpAcceptHeader = (req: Request) => {
  const accept = req.headers.accept ?? '';
  if (
    !accept.includes('application/json') ||
    !accept.includes('text/event-stream')
  ) {
    req.headers.accept = 'application/json, text/event-stream';
  }
};

@Public()
@Controller()
export class McpController {
  constructor(
    private readonly service: McpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Landing page for people who paste the endpoint into a browser.
   *
   * MCP clients always POST (or open an SSE stream with `Accept:
   * text/event-stream`); a plain browser navigation only produces the
   * "Use POST" JSON-RPC error, which reads like a broken deployment. Browsers
   * are the only callers sending `Accept: text/html`, so they get a short
   * explanation instead — every real client still sees the JSON-RPC error.
   */
  private browserLandingPage(req: Request) {
    const editor = (this.config.get<string>('MCP_EDITOR_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.headers.host ?? '';
    const endpoint = host
      ? `${proto}://${host}${req.originalUrl}`
      : req.originalUrl;
    const link = editor ? `${editor}/connect/ai` : '';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dLander MCP endpoint</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px;
font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
background:#f6f7fb;color:#1b1b1f}
main{max-width:560px}
h1{font-size:22px;line-height:1.3;margin:0 0 16px}
p{margin:0 0 12px;color:#4a4a55}
code{background:#e9ebf2;border-radius:6px;padding:2px 6px;font-size:13px;word-break:break-all}
a{color:#3b5bdb}
.note{margin-top:20px;padding:12px 14px;border-left:3px solid #3b5bdb;background:#fff;border-radius:8px;color:#1b1b1f}
@media (prefers-color-scheme:dark){
body{background:#121216;color:#eceef5}
p{color:#a8aab8}
code{background:#23242c}
.note{background:#1a1b22;color:#eceef5}
a{color:#8fa6ff}
}
</style>
</head>
<body>
<main>
<h1>This is a dLander MCP endpoint</h1>
<p>It speaks <strong>Streamable HTTP</strong> and only answers <code>POST</code>
requests from an MCP client. Seeing this page in a browser is expected — the
endpoint is not a website.</p>
<p>Endpoint: <code>${escapeHtml(endpoint)}</code></p>
<div class="note">Add it to ChatGPT, Claude, Cursor or any MCP-capable assistant
as a remote MCP server, choose “No authentication”, then ask for a design.
${link ? `<a href="${escapeHtml(link)}">Setup guide</a>` : ''}</div>
</main>
</body>
</html>`;
  }

  @All('mcp')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async handle(@Req() req: Request, @Res() res: Response) {
    this.service.assertEnabled();
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      const accept = req.headers.accept ?? '';
      // Only a real browser navigation asks for HTML and nothing machine
      // readable. Clients that also accept JSON keep getting the JSON-RPC
      // error, so a validator can never be handed a web page.
      if (
        req.method === 'GET' &&
        accept.includes('text/html') &&
        !accept.includes('application/json')
      ) {
        res.setHeader('X-Robots-Tag', 'noindex');
        return res.status(200).type('html').send(this.browserLandingPage(req));
      }
      return res.status(405).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message: 'Use POST; this server is stateless',
        },
      });
    }
    ensureMcpAcceptHeader(req);
    // The endpoint is public and stateless (no cookies, no credentials), so it
    // is intentionally callable from any web origin. Restricting origins here
    // blocked browser-based clients such as ChatGPT's connector setup.
    const server = new McpServer(
      { name: 'dlander', version: '1.0.0' },
      {
        instructions:
          'Create editable dLander designs. Read get_design_guide before designing; then call create_design and give the user the returned openUrl. No API key or dLander login is needed. Links expire in 24 hours. create_design carries vector shapes and text only — for images, follow the guide’s IMAGE section and print the JSON for the /connect/ai paste box instead.',
      },
    );
    server.registerTool(
      'get_design_guide',
      {
        description:
          'Read the compact dLander scene contract, fonts and design rules. Read before the first design; reuse within the conversation.',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => ({
        content: [{ type: 'text', text: await this.service.guide() }],
      }),
    );
    server.registerTool(
      'create_design',
      {
        description:
          'Validate and save a complete editable vector scene for 24 hours. Returns an openUrl for the dLander canvas. Send the complete revised scene for changes. Vector shapes and text only: no images, no external fetches (images use the paste hand-off in get_design_guide).',
        inputSchema: sceneShape,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async (args) => {
        try {
          const result = await this.service.create(args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          if (error instanceof BadRequestException) {
            return {
              isError: true,
              content: [{ type: 'text', text: error.message }],
            };
          }
          return {
            isError: true,
            content: [
              { type: 'text', text: 'Unable to save design. Try again later.' },
            ],
          };
        }
      },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get('api/v1/mcp/designs/:token')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async design(@Param('token') token: string, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.json(await this.service.get(token));
  }
}
