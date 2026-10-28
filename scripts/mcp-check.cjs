// Check a deployed MCP endpoint without a provider API key.
// Default mode only discovers tools and reads the guide; --create is explicit.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

async function main() {
  const endpoint = process.argv[2];
  if (!endpoint)
    throw new Error(
      'Usage: npm run mcp:check -- https://YOUR-API/mcp [--create [scene.json]]',
    );
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new Error('Use HTTPS, or localhost for development.');
  const client = new Client({
    name: 'dlander-deployment-check',
    version: '1.0.0',
  });
  try {
    await client.connect(new StreamableHTTPClientTransport(url));
    const tools = await client.listTools();
    for (const name of ['get_design_guide', 'create_design'])
      assert.ok(
        tools.tools.some((tool) => tool.name === name),
        `Missing tool: ${name}`,
      );
    const guide = await client.callTool({
      name: 'get_design_guide',
      arguments: {},
    });
    assert.ok(!guide.isError, 'Guide tool returned an error');
    assert.ok(
      guide.content.some(
        (part) =>
          part.type === 'text' && part.text.includes('dlander/clipboard'),
      ),
      'Scene contract missing',
    );
    console.log(
      'Connected: initialization, both tools, and design guide are available.',
    );
    if (process.argv[3] === '--create') {
      const scene = process.argv[4]
        ? JSON.parse(readFileSync(process.argv[4], 'utf8'))
        : {
            type: 'dlander/clipboard',
            files: {},
            elements: [
              {
                id: randomUUID(),
                type: 'rectangle',
                x: 100,
                y: 100,
                width: 240,
                height: 120,
                backgroundColor: '#dbeafe',
                borderRadius: 16,
              },
            ],
          };
      const result = await client.callTool({
        name: 'create_design',
        arguments: scene,
      });
      assert.ok(!result.isError, JSON.stringify(result.content));
      const data = result.structuredContent;
      assert.equal(typeof data?.openUrl, 'string');
      const token = new URL(data.openUrl).hash.slice(5);
      assert.match(token, /^[a-f0-9]{64}$/);
      const downloadUrl = new URL(`/api/v1/mcp/designs/${token}`, url);
      const response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200, 'Guest design download failed');
      const stored = await response.json();
      assert.equal(stored.elements.length, scene.elements.length);
      console.log(
        `Persistent design creation and guest download passed (${stored.elements.length} elements).`,
      );
      // This is a private bearer link; printed only on an explicit --create run.
      console.log(`Open in canvas: ${data.openUrl}`);
    }
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'MCP check failed');
  process.exitCode = 1;
});
