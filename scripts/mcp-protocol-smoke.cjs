// Real HTTP transport and official SDK client; no model key or live database.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { Reflector, APP_GUARD } = require('@nestjs/core');
const { ThrottlerGuard, ThrottlerModule } = require('@nestjs/throttler');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { McpController } = require('../dist/mcp/mcp.controller');
const { McpService } = require('../dist/mcp/mcp.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { JwtAuthGuard } = require('../dist/auth/jwt-auth.guard');
const { setupApplication } = require('../dist/setup-app');

async function main() {
  const records = new Map();
  const prisma = {
    mcpDesign: {
      create: async ({ data }) => {
        records.set(data.tokenHash, data);
        return data;
      },
      findUnique: async ({ where }) => records.get(where.tokenHash) ?? null,
      deleteMany: async () => ({ count: 0 }),
    },
  };
  const config = new ConfigService({
    MCP_ENABLED: 'true',
    MCP_EDITOR_URL: 'https://editor.example/land',
    FRONTEND_URL: 'https://editor.example',
  });
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
    controllers: [McpController],
    providers: [
      McpService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  setupApplication(app);
  app.useGlobalGuards(new JwtAuthGuard(new Reflector(), {}, config, prisma));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const client = new Client({
    name: 'dlander-protocol-smoke',
    version: '1.0.0',
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
    );
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      'create_design',
      'get_design_guide',
    ]);
    const guide = await client.callTool({
      name: 'get_design_guide',
      arguments: {},
    });
    assert.match(guide.content[0].text, /dlander\/clipboard/);
    const args = process.argv[2]
      ? JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'))
      : {
          type: 'dlander/clipboard',
          files: {},
          elements: [
            {
              id: randomUUID(),
              type: 'rectangle',
              x: 100,
              y: 100,
              width: 120,
              height: 80,
            },
          ],
        };
    const created = await client.callTool({
      name: 'create_design',
      arguments: args,
    });
    assert.ok(!created.isError, JSON.stringify(created));
    const result = created.structuredContent;
    const token = new URL(result.openUrl).hash.slice(5);
    const downloaded = await fetch(`${base}/api/v1/mcp/designs/${token}`);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('cache-control'), 'no-store');
    const scene = await downloaded.json();
    assert.equal(scene.elements.length, args.elements.length);
    assert.equal(
      (await fetch(`${base}/api/v1/mcp/designs/${'b'.repeat(64)}`)).status,
      404,
    );
    const invalid = await client.callTool({
      name: 'create_design',
      arguments: {
        ...args,
        elements: [{ ...args.elements[0], frameId: randomUUID() }],
      },
    });
    assert.equal(invalid.isError, true);
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
    const forbidden = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(forbidden.status, 403);
    console.log(
      `MCP protocol smoke passed: initialize, tool discovery, guide, create (${scene.elements.length} elements), guest download, validation, expiry lookup, method and origin checks.`,
    );
  } finally {
    await client.close();
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
