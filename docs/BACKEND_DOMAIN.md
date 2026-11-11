# Backend domain: mcp.dlander.com

The backend API and MCP transport use the same Vercel project and public origin:
`https://mcp.dlander.com`. MCP remains at `/mcp`; the root URL is not an MCP alias.
API endpoints retain their `/api/v1/...` paths. No database migration is needed.

Add `mcp.dlander.com` to the existing backend project's Vercel Domains and configure
its DNS with the exact record Vercel provides. Do not point this subdomain at the
frontend project. Keep the former domain available during the migration for old
clients and existing shared URLs.

Set backend production environment values:

```dotenv
OAUTH_CALLBACK_BASE_URL=https://mcp.dlander.com
TEMPLATE_SHARE_BASE_URL=https://mcp.dlander.com
TEMPLATE_STORAGE_PUBLIC_BASE_URL=https://mcp.dlander.com/api/v1/template-objects
FRONTEND_URL=https://dlander.com
CORS_ORIGINS=https://dlander.com,https://www.dlander.com
MCP_ENABLED=true
MCP_EDITOR_URL=https://dlander.com/land
```

Only replace TEMPLATE_STORAGE_PUBLIC_BASE_URL when serving objects through this
backend. Preserve a separately configured storage/CDN origin and any additional
trusted CORS origins. Provider keys, JWT secrets and database URLs do not change.
Register the new callback URLs with enabled Google, GitHub and Facebook OAuth apps:
`https://mcp.dlander.com/api/v1/auth/social/{provider}/callback`.
Keep old authorized callbacks during the transition where the provider supports it.

Redeploy the backend after environment changes. Then update and redeploy the
frontend with VITE_APP_API_BASE_URL=https://mcp.dlander.com and
VITE_APP_MCP_SERVER_URL=https://mcp.dlander.com/mcp. Frontend deployments using the
same-origin `/gateway` proxy can keep that API base; their proxy destination must
point to the new origin.

Verify login, saved-land loading, template previews and sharing, OAuth callbacks,
and MCP initialize/tools/list/get_design_guide against the new origin. Updating
source files does not configure Vercel DNS or environment values automatically.
