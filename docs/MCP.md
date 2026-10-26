# Guest dLander MCP

This server exposes tools over stateless Streamable HTTP at `/mcp`. It never invokes an AI provider, reads provider keys, charges platform credits, or requires a dLander account. The user's MCP host decides which model and billing method it uses. A subscription does not imply that every host or plan supports custom MCP connections.

## Deploy

1. Install dependencies (`npm ci`), generate Prisma (`npx prisma generate`) and build (`npm run build`).
2. Apply the migration with `npm run db:migrate:deploy` against the intended database.
3. Set `MCP_ENABLED=true` and `MCP_EDITOR_URL=https://YOUR-FRONTEND/land`. The editor must include the accompanying `#mcp=` import implementation and have `VITE_APP_API_BASE_URL` pointing at this backend.
4. Keep `FRONTEND_URL` / `CORS_ORIGINS` consistent with that editor origin. Use a reachable HTTPS endpoint, e.g. `https://YOUR-API/mcp`. Localhost is not reachable by cloud assistants; for development, expose the API using a trusted HTTPS tunnel.
5. Run `npm run retention:cleanup` periodically (for example hourly). Links expire after 24 hours even if cleanup is delayed; cleanup physically deletes expired payloads. Deployments without scheduled cleanup will accumulate inaccessible records.

JSON payloads are stored in PostgreSQL, not local disk, so multi-instance and serverless deployments work. This intentionally uses one database row per design for the initial version, avoiding a new object-storage system or distributed session state. It has storage and database-operation costs. Revisit object storage when volume warrants it. No raw bearer token is stored in the database.

## Connect

Add a remote/custom MCP server in your assistant with the public `/mcp` URL and **No authentication**. Enable the two discovered tools. UI names and availability depend on the assistant and account/workspace policy. This is an unlisted custom connection, not automatic publication in a connector directory.

Prompt: "Use dLander. Read get_design_guide, design a Persian login page, call create_design with the complete scene, and give me the openUrl."

`get_design_guide` provides the bundled prompt. `create_design` accepts structured `{type: "dlander/clipboard", elements: [...], files: {}}`, validates IDs and references, and returns `{openUrl, expiresAt, elementCount}`. Follow-up edits submit a complete revised scene and get a new link. The link opens a new canvas import; it does not remotely mutate an already open tab.

This initial transport allows up to 2,000 elements and 1,000,000 bytes per scene, vector/text/custom shapes only, and no image uploads. These are service limits overriding the general prompt's unlimited element count. The frontend asks before replacing a nonempty local scene. Anyone holding a design link can read it until expiry: treat links as private access credentials.

## Verify

Run `npm test -- --runInBand mcp` and `npm run build`.
Run `npx @modelcontextprotocol/inspector` and connect using Streamable HTTP to `/mcp`; test initialize, tools/list, both tools, validation failures and a returned link.
For protocol smoke without database/model keys, run `node scripts/mcp-protocol-smoke.cjs` after building. It mounts the real controller with an in-memory persistence stub and uses the official MCP client.

Existing API rate limits still apply; the MCP endpoint adds a 30-request/minute/IP limit and downloads 60/minute/IP. Configure `TRUST_PROXY` to match the actual ingress. Hosts may share outbound IPs; adjust measured limits if necessary. There is no global storage quota in this first implementation: monitor public usage and enforce a deployment-level budget/WAF limit before broad promotion.

Guest design requests are excluded from persistent request tracking to prevent bearer tokens or scene bodies being copied into tracking records. Ensure reverse-proxy and platform logs also redact `/api/v1/mcp/designs/*` URLs. The frontend receives access tokens through URL fragments, removes the fragment after loading, fetches without cookies and uses no-store responses.

Only expose HTTPS in production. Stateless GET/DELETE on `/mcp` return 405; this is expected. This implements standard tool calls and external canvas links, not MCP Apps inline UI or legacy HTTP+SSE transport.


## Verify a deployment

After migration and redeployment, discover the live tools without creating data:

```powershell
npm run mcp:check -- https://YOUR-API/mcp
```

To verify real database persistence and receive a canvas link, explicitly create a temporary test design:

```powershell
npm run mcp:check -- https://YOUR-API/mcp --create
```

An optional final argument is the path to a compact scene JSON file. The link printed by `--create` is private. A successful check still requires opening the link in the deployed frontend to verify that its API base URL and CORS configuration match. The local smoke test uses mock persistence; the deployment check exercises the actual deployed database.

Current implementation is not automatically deployed by editing these files. Configure the deployment environment, apply the migration once, deploy both repositories, then add the HTTPS `/mcp` endpoint to your assistant with No authentication.