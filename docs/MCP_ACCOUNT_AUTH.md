# MCP account connection

The two endpoints are independent:

| Endpoint | Authentication | Access |
| --- | --- | --- |
| `https://mcp.dlander.com/mcp` | None | Existing anonymous design workflow, 24-hour links |
| `https://mcp.dlander.com/mcp/account` | OAuth authorization code + PKCE S256 | The signed-in user's saved lands and explicitly allowed WordPress sites |

Existing anonymous connectors do not need to be changed. Ordinary web JWTs and WordPress installation credentials are not accepted as MCP OAuth tokens.

## Backend deployment

Deploy both repositories. Before enabling the account endpoint, run the backend migration using the normal production database migration procedure:

```powershell
npm.cmd run db:migrate:deploy
```

Set these environment variables in the **backend Vercel project**, then redeploy:

```dotenv
MCP_ENABLED=true
MCP_ACCOUNT_ENABLED=true
MCP_OAUTH_ISSUER_URL=https://mcp.dlander.com
MCP_OAUTH_SECRET_ENCRYPTION_KEY=<a stable, random secret of at least 32 characters>
FRONTEND_URL=https://dlander.com
CORS_ORIGINS=https://dlander.com,https://www.dlander.com
```

Generate the encryption key in a password manager or another secure local secret generator. Keep it in backend environment variables only; never commit it or use a `VITE_` prefix. Keep the same value across server instances and deployments. Replacing it invalidates stored confidential OAuth client credentials; those clients must register again. No Google/GitHub OAuth credentials are needed for the MCP authorization server itself. Existing dLander login providers can still be used to sign in to the consent page.

Frontend settings remain:

```dotenv
VITE_APP_API_BASE_URL=https://mcp.dlander.com
VITE_APP_MCP_SERVER_URL=https://mcp.dlander.com/mcp
```

The Connect AI page derives `/mcp/account` from the public endpoint. Do not set the public MCP variable to the account endpoint. The account endpoint is disabled by default until the migration and environment variables are ready. There is no live database migration or deployment performed by this source change.

## Assistant setup and user experience

1. Open **Connect AI** (`/connect/ai`). Copy the **account** endpoint.
2. Add a separate remote MCP connection in the assistant and choose **OAuth**. Dynamic client registration supports public clients (`none`) and confidential clients (`client_secret_post`). A client that supports discovery/registration does not need manually supplied credentials.
3. Discovery uses `/.well-known/oauth-protected-resource/mcp/account` and `/.well-known/oauth-authorization-server`. The server provides `/authorize`, `/token`, `/register`, and `/revoke` at its origin. Proxies must forward these routes as well as `/mcp/account` if a different public gateway is used.
4. Sign in to dLander. The consent page shows the requesting client's name and return URI. Client names are self-declared, not verified identities. Only approve a connection started from the intended assistant.
5. Choose permissions. Land read is selected initially when requested; writes are opt-in. WordPress permissions additionally require selecting owned, enabled sites. Read permissions are required alongside corresponding write permissions.
6. Ask the assistant to list lands, read one and edit it. `save_land` requires the revision returned by `get_land`. A concurrent saved revision causes a conflict instead of overwriting it. Changes create normal land revisions and use existing storage quotas.
7. Revoke a connection under **Connect AI → Connected assistants**. Revocation invalidates its access and refresh tokens. Connections expire after 30 days; access tokens last at most one hour. Refresh tokens rotate; reuse invalidates the connection.

The assistant sees saved server content, not unsaved changes in an open editor. If the editor was already open, reopen the land to see the assistant's saved result. Do not keep editing a stale open copy while the assistant is working on that land.

## Tools and permissions

| Tools | Required scope |
| --- | --- |
| `list_lands`, `get_land` | `lands:read` |
| `save_land` | `lands:write` (grant also includes `lands:read`) |
| `list_wordpress_sites`, `list_wordpress_edits`, `get_wordpress_edit` | `wordpress:read` |
| `create_wordpress_edit`, `complete_wordpress_edit` | `wordpress:write` (grant also includes `wordpress:read`) |

No MCP tool deletes lands, changes installation keys, reads another user's lands, or publishes WordPress posts. `get_design_guide` provides private-endpoint editing instructions without accessing user content.

## WordPress integration

Use the existing WordPress installation connection flow first: the plugin creates `/api/v1/wordpress/connection-requests`, the user approves it in dLander, and the installation retains its own installation key and site URL. The MCP assistant never receives that key.

The assistant can only use sites selected at OAuth consent. Disabling or removing a site takes effect on subsequent calls. To add another site, reconnect and select it.

For a plugin-initiated edit:

1. The plugin creates a session through `POST /api/v1/wordpress/edit-sessions` using `X-Dlander-Installation-Key` and `X-Dlander-Site-Url`.
2. The assistant discovers that site's sessions, reads the input and completes the selected session with revised text/JSON.
3. The plugin retrieves `GET /api/v1/wordpress/edit-sessions/:id/result` with its own installation headers, then lets the WordPress user review/apply the result.

The assistant can also prepare a session for a selected site with `create_wordpress_edit`. This prepares data in dLander; the plugin must know the returned session ID and retrieve its completed result. This repository contains no WordPress PHP plugin or direct WordPress publishing implementation. Applying changes to a post requires the installed plugin to consume the result; MCP completion alone does not modify a WordPress database.

## Operations and verification

Run the existing `retention:cleanup` task regularly. It now removes expired OAuth requests, expired/revoked grants and expired access tokens. Used refresh hashes remain until grant cleanup to detect replay. OAuth credentials and canvas payloads are excluded from application request-body tracking for account MCP and consent endpoints. Bearer/code/refresh values are stored as hashes; confidential client secrets are encrypted.

Local checks cover SDK discovery, registration, PKCE, code reuse, resource binding, refresh rotation/replay, scopes, ownership, site selection and revocation. Production OAuth consent in ChatGPT and an installed WordPress plugin must still be verified after deployment. Do not treat local tests as confirmation that a particular assistant has accepted the deployed connector.

Official protocol reference: [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth).
