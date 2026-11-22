# dLander MCP ? account connection

The only MCP endpoint is `https://mcp.dlander.com/mcp`. It requires OAuth. Anonymous MCP and `/mcp/account` are no longer exposed. Existing connectors must be recreated with OAuth and the current endpoint; old anonymous design download links are no longer served.

## Deployment

Deploy both repositories. If the OAuth database migration has not been applied, run `npm.cmd run db:migrate:deploy` from the backend with the intended database configuration before enabling the feature.

Backend Vercel environment:

```dotenv
MCP_ENABLED=true
MCP_ACCOUNT_ENABLED=true
MCP_OAUTH_ISSUER_URL=https://mcp.dlander.com
MCP_OAUTH_SECRET_ENCRYPTION_KEY=<keep your existing stable random secret>
FRONTEND_URL=https://dlander.com
CORS_ORIGINS=https://dlander.com,https://www.dlander.com
```

Do not regenerate the existing encryption key for this URL migration. If setting it up for the first time, generate a secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store it only in backend secrets, never in Git or `VITE_` variables. It encrypts confidential OAuth client credentials. Account access is disabled when `MCP_ACCOUNT_ENABLED` is false; disabling it does not restore anonymous access.

Frontend Vercel environment:

```dotenv
VITE_APP_API_BASE_URL=https://mcp.dlander.com
VITE_APP_MCP_SERVER_URL=https://mcp.dlander.com/mcp
```

Redeploy after changing environment variables. No new database schema migration is needed solely for the endpoint change. Existing grants are bound to `/mcp/account` and cannot authorize `/mcp`; reconnect assistants to issue new grants. Users can revoke old connections from Connect AI.

## Connect and verify

1. Open `/connect/ai`, copy the endpoint under **Connect your account**.
2. Add a remote MCP server in your assistant with OAuth. Dynamic client registration supports `none` and `client_secret_post`; never paste the encryption key into the assistant.
3. Sign in to dLander, review the client's self-declared name and callback address, choose permissions, and select allowed WordPress sites if needed. Writes are opt-in and require the corresponding read permission.
4. Ask the assistant to list lands, read one, and save a requested edit. It must supply the revision returned by `get_land` as `expectedRevision`. Concurrent saved changes cause a conflict instead of overwriting newer work.
5. Revoke access through **Connect AI ? Connected assistants**.

Discovery endpoints:

- `https://mcp.dlander.com/.well-known/oauth-authorization-server`
- `https://mcp.dlander.com/.well-known/oauth-protected-resource/mcp`

Anonymous calls to `/mcp` must return 401 and a `WWW-Authenticate` discovery challenge. OAuth routes `/authorize`, `/token`, `/register`, and `/revoke` remain on the backend origin. `/mcp/account` must no longer initialize an MCP connection. Production ChatGPT login must be verified after deployment; local tests do not establish host acceptance.

## Permissions and editing

| Tools | Scope |
| --- | --- |
| `list_lands`, `get_land` | `lands:read` |
| `save_land` | `lands:write` plus `lands:read` |
| `list_wordpress_sites`, `list_wordpress_edits`, `get_wordpress_edit` | `wordpress:read` |
| `get_wordpress_site_content`, `list_wordpress_content`, `get_wordpress_content` | `wordpress:read` |
| `save_wordpress_land` | `wordpress:read` plus `lands:write` |

Only saved server content is available. Reopen an already open land to see the assistant's result; avoid editing a stale copy while the assistant is working. Saves create normal revisions and enforce existing storage quotas. Connections expire after 30 days, access tokens last at most one hour, refresh tokens rotate and replay revokes the grant. Run `retention:cleanup` regularly.

## WordPress

Connect the installed plugin to the dLander account first using the existing installation connection/approval flow. At OAuth consent select the sites the assistant may access. Installation keys never reach the assistant. Disabling/removing a site blocks subsequent calls.

The plugin creates `POST /api/v1/wordpress/edit-sessions` with `X-Dlander-Installation-Key` and `X-Dlander-Site-Url`. The assistant reads and completes the allowed session. The plugin retrieves `GET /api/v1/wordpress/edit-sessions/:id/result` with its own installation headers, then reviews/applies the result. The assistant can also prepare a session and return its ID for the plugin to consume.

This repository has no WordPress PHP plugin or direct post-publishing implementation. Completing an MCP session alone does not change a WordPress post.

## Current WordPress snapshot workflow

The synchronized site-content workflow now sends MCP proposals only to lands. MCP no longer exposes `create_wordpress_edit` or `complete_wordpress_edit`. The manual installation/editor APIs described above remain available to the user. See [WordPress content synchronization](WORDPRESS_CONTENT_SYNC.md) for the host-to-frontend JSON/message contract, snapshot APIs and deployment migration.


## Assistant-edited images in the same land

Account MCP supports the following flow without calling a dLander image-generation provider:

1. Read `get_land` and note the current revision plus the original image element ID/file ID.
2. Call `get_land_image` to inspect that image. Bucket-backed images return a stored 768px preview as native MCP image content and a short-lived original download link.
3. Use the assistant's own image editing tool to produce the requested result.
4. Call `import_land_image` with `landId`, `expectedRevision`, `sourceElementId`, and the actual edited `file`. The descriptor includes `_meta["openai/fileParams"]: ["file"]`. ChatGPT supplies `{download_url,file_id,mime_type?,file_name?}`. Never invent references or pass `sandbox:` paths.
5. The backend checks ownership, land-write scope, revision, image size/type/dimensions, and downloads the file using bounded HTTPS requests with DNS pinning and private-address/redirect checks.
6. The original image stays unchanged. A new image element is appended beside it in the same land, and the returned editor link focuses that new element. Optional x/y/width/height override placement.

`import_land_image` accepts files up to 8 MB, maximum 8192px per side / 20 megapixels. The legacy `add_land_image` accepts inline files up to 1 MB and now uses the same bucket persistence. Neither tool edits images itself or charges dLander AI credits. Native file transfer depends on the assistant/client: if it cannot provide its generated file, it must ask the user to attach it rather than claim the result was saved.

Original bytes and a one-time PNG preview are private bucket objects. Identical images within a land reuse the stored asset. The database stores metadata and the JSON revision contains only `landAssetId`; it does not embed the new image bytes or an expiring URL. Normal user-uploaded/legacy inline images keep their existing storage behavior. Opening a land resolves owner-authorized, five-minute signed URLs and downloads directly from the bucket. Later editor saves strip hydrated bytes from bucket-backed files. Exported design files still include downloaded image bytes for portability.

Both original and preview bytes count toward the owner's storage quota. Existing revision retention is respected. `npm.cmd run retention:cleanup` removes assets from deleted lands and assets unused by all retained revisions after a 24-hour grace period; run it on the existing maintenance schedule. Failed revision saves can leave a staged asset until that cleanup.

### Deployment

- Apply `npm.cmd run db:migrate:deploy` in the backend, then publish backend and frontend.
- No new environment variables: this uses the existing `TEMPLATE_STORAGE_*` bucket configuration. Production must use the S3 driver, not ephemeral local storage.
- The bucket must allow browser GET/HEAD requests from `https://dlander.com` through its CORS configuration (add localhost/preview origins only when needed). Keep the bucket private. Signed download URLs authorize only individual temporary reads.
- Refresh/reconnect the assistant's MCP tool list to discover `import_land_image`; it requires `lands:write` and reading requires `lands:read`.
- Smoke test in ChatGPT: ask it to read a saved car image, edit its color with its own editor, and append the edited file beside the original. Then reopen the land, save a text edit, reload and verify both images remain. This live assistant test is separate from local mocked transfer tests.

Official file parameter contract: https://developers.openai.com/apps-sdk/reference/
