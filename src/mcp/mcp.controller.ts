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

@Public()
@Controller()
export class McpController {
  constructor(
    private readonly service: McpService,
    private readonly config: ConfigService,
  ) {}

  @All('mcp')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async handle(@Req() req: Request, @Res() res: Response) {
    this.service.assertEnabled();
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message: 'Use POST; this server is stateless',
        },
      });
    }
    const allowed = (
      this.config.get<string>('CORS_ORIGINS') ??
      this.config.getOrThrow<string>('FRONTEND_URL')
    )
      .split(',')
      .map((v) => v.trim());
    if (req.headers.origin && !allowed.includes(req.headers.origin))
      return res.status(403).json({ error: 'Origin not allowed' });
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
