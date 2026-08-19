# WordPress Plugin Connect + Edit Bridge — Design

Date: 2026-08-19  
Status: implemented (backend)

## Goal

Let a WordPress plugin connect to a Dlander account **without** the user manually registering a domain or copying an installation key in the Dlander UI, and **without** a separate WordPress email/password login.

Flow:

1. Plugin generates an installation key locally.
2. Plugin creates a short-lived connection request on the backend.
3. Plugin opens a Dlander browser tab/popup (`approveUrl`).
4. If the user is not logged in on Dlander web, they log in there.
5. User confirms “connect this WordPress site to this account”.
6. Backend binds domain + key hash to the logged-in user as a `WordPressSite`.
7. Plugin polls until approved, then uses key + site URL for API calls.
8. For editor work, plugin opens Dlander (same web session); images/text/video move through edit-session APIs.

Dlander usage **without** the plugin must remain unchanged (web auth, lands, templates, billing, etc.).

## Non-goals

- OAuth social login.
- Mandatory re-approval every 30 days for an established connection.
- Plugin-side email/password login against Dlander.
- Requiring the user to pre-create domains in Dlander before installing the plugin.

## Decisions

| Topic | Decision |
|-------|----------|
| Connection UX | Approach A: Dlander tab/popup for login + approve |
| Connect protocol | Pending connection request + poll (not WP callback OAuth) |
| Established connection TTL | No forced expiry; revoke via disconnect / rotate / disable |
| Pending request TTL | Short (10–15 minutes) |
| Plugin API auth after connect | `X-Dlander-Installation-Key` + `X-Dlander-Site-Url` (no WordPress JWT session) |
| Manual domain registration as required step | Removed from product flow |
| `POST /api/v1/auth/wordpress/login` | Remove |
| Web-only Dlander | Unaffected |

## Architecture

```text
[WP Plugin]                    [Backend]                         [Dlander Web]
     |                              |                                   |
     | POST connection-request      |                                   |
     | (siteUrl, key, metadata)     |-- store pending (key hash) -->    |
     |<-- requestId, approveUrl ----|                                   |
     | open approveUrl tab ---------+---------------------------------->|
     |                              |         login if needed (WEB)     |
     |                              |<-------- POST approve (WEB JWT) --|
     |                              |-- create/update WordPressSite --> |
     | GET status (poll) ----------->                                   |
     |<-- approved -----------------|                                   |
     |                              |                                   |
     | POST edit-session + assets -->|                                   |
     | open editor URL -------------+---------------------------------->|
     |                              |<-------- complete (WEB JWT) ------|
     | GET result ------------------>                                   |
```

## Data model

### `WordPressConnectionRequest` (new)

- `id` (UUID) — public `requestId`
- `domain` (normalized hostname)
- `siteName` (optional)
- `installationKeyHash` (SHA-256 of plugin-generated key)
- `metadataJson` (optional)
- `status`: `PENDING | APPROVED | DENIED | EXPIRED`
- `expiresAt` (pending window, 10–15 min)
- `userId` (set on approve)
- `wordpressSiteId` (set on approve)
- `createdAt`, `updatedAt`
- Indexes: `status + expiresAt`, unique active pending per domain optional (last request wins or reject duplicate pending)

### `WordPressSite` (existing, keep)

- Still stores `userId`, `domain`, `installationKeyHash`, `enabled`, `metadataJson`, `lastConnectedAt`
- Created/updated **only** on approve (or later rotate), not via mandatory manual “register domain” UX
- Unique `(userId, domain)` remains
- Established link: **no** `expiresAt` required

### Sessions

- Keep `SessionClientType.WEB` as the only login path for humans.
- Stop creating `WORDPRESS` JWT sessions for the main product path.
- Plugin machine auth = installation key + matching enabled site domain (guard or dedicated middleware).

### `WordPressEditSession` (new)

- `id`, `userId`, `wordpressSiteId`
- `status`: `OPEN | COMPLETED | CANCELLED | EXPIRED`
- `expiresAt` (working session TTL, hours-scale — separate from site connection)
- `inputText` / `inputJson` (optional)
- `outputText` / `outputJson` (optional)
- `assets` relation or JSON list of stored object keys (image/video)
- `editorPath` or computed frontend URL for the plugin to open

### Media storage

Reuse existing object storage (`OBJECT_STORAGE` / R2). Store under a prefix scoped by `userId` / `editSessionId`. Enforce MIME allowlist and max size.

## API

### Remove

- `POST /api/v1/auth/wordpress/login`

### Connection (new)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/wordpress/connection-requests` | Public + strong throttle | Plugin creates pending request. Body: `siteUrl`, `siteName?`, `installationKey`, `metadata?`. Response: `requestId`, `expiresAt`, `approveUrl` |
| `GET` | `/api/v1/wordpress/connection-requests/:id` | Public with request id (+ optional create-time secret if we add one) | Status for poll / approve page bootstrap |
| `POST` | `/api/v1/wordpress/connection-requests/:id/approve` | Web Bearer only | Bind site to current user |
| `POST` | `/api/v1/wordpress/connection-requests/:id/deny` | Web Bearer only | Mark denied |

`approveUrl` format (frontend): `{FRONTEND_URL}/connect/wordpress?requestId=...`

### Site management (keep, role adjusted)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/users/me/wordpress-sites` | Web | List connected sites |
| `PATCH` | `/api/v1/users/me/wordpress-sites/:id` | Web | `name`, `enabled` (prefer **not** allowing casual domain rewrite; reconnect instead) |
| `DELETE` | `/api/v1/users/me/wordpress-sites/:id` | Web | Disconnect |
| `POST` | `/api/v1/users/me/wordpress-sites/:id/rotate-key` | Web | Issue new key material policy: either return new key for user to paste, or require plugin-driven rotate — prefer web rotate that invalidates old key and returns new key once |

`POST /api/v1/users/me/wordpress-sites` (manual create) may remain for admin/dev, but is **not** required for the plugin product flow. Prefer documenting plugin-first connect only; optional keep endpoint for compatibility or remove if unused.

### Edit bridge (new)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/wordpress/edit-sessions` | Installation key + site URL | Start session; optional text/metadata |
| `POST` | `/api/v1/wordpress/edit-sessions/:id/assets` | Installation key + site URL | Upload image/video (multipart or presigned PUT) |
| `GET` | `/api/v1/wordpress/edit-sessions/:id` | Web **or** installation key | Status + payloads |
| `POST` | `/api/v1/wordpress/edit-sessions/:id/complete` | Web only | Editor writes result |
| `GET` | `/api/v1/wordpress/edit-sessions/:id/result` | Installation key + site URL | Plugin pulls final text/media refs |

Frontend editor entry: `{FRONTEND_URL}/editor/wordpress?sessionId=...` (exact path owned by frontend; backend returns it in create response).

### Plugin headers (post-connect)

```http
X-Dlander-Installation-Key: <raw key>
X-Dlander-Site-Url: https://shop.example.com
```

No `Authorization: Bearer` required for plugin machine routes in this design. Web routes still use Bearer access tokens as today.

## Security

- Store only hashes of installation keys (`hashOpaqueToken` / SHA-256 as existing).
- Pending requests expire in 10–15 minutes; expired cannot be approved.
- Strong rate limits on create/poll/approve.
- Approve/deny require active web session; domain and key hash come from the pending row (client cannot swap domain at approve time).
- After approve, plugin APIs require exact domain match + key hash match + `enabled=true`.
- Established connections do not auto-expire.
- Media: MIME allowlist, size caps, ownership checks.
- CORS remains for Dlander web origins only; plugin is server-to-server and does not rely on browser CORS.

## Error codes (stable)

- `CONNECTION_REQUEST_EXPIRED`
- `CONNECTION_REQUEST_DENIED`
- `CONNECTION_REQUEST_NOT_FOUND`
- `CONNECTION_REQUEST_NOT_PENDING`
- `SITE_DISABLED`
- `INVALID_INSTALLATION_KEY`
- `EDIT_SESSION_EXPIRED`
- `EDIT_SESSION_ALREADY_COMPLETED`
- `UNSUPPORTED_MEDIA`
- `FILE_TOO_LARGE`

Unauthenticated web users hitting approve UI are redirected by the frontend to web login, then returned to the approve page.

## Compatibility / web-only Dlander

- Do not gate web login, lands, templates, AI, payments, or profile APIs on WordPress connection state.
- WordPress modules are additive; absence of any `WordPressSite` is a normal state.
- Removing WordPress JWT login must not change `POST /api/v1/auth/login` behavior.

## Docs to update

- `docs/WORDPRESS_AUTH_FA.md` — rewrite for connection-request flow
- `docs/pdf-sources/wordpress-auth-guide-fa.html` (+ regenerate PDF if pipeline exists)
- `README.md` references
- `docs/pdf-sources/react-auth-guide-fa.html` if it still describes WP password login / WP JWT headers as primary

## Tests (minimum)

- Domain normalize (existing)
- create request → web approve → plugin key auth succeeds
- approve without web auth fails
- expired pending cannot approve
- deny then poll shows denied
- disconnect / disable blocks plugin key auth
- web-only smoke: register/login/me still pass
- edit-session happy path: create → upload → complete → result

## Implementation notes

1. Prefer Nest modules under `src/wordpress/` for connection requests + edit sessions; keep auth module free of WP password login.
2. Extract shared “verify installation key + site URL → site + user” helper used by plugin routes and (if needed) guards.
3. Job or lazy check to mark pending rows `EXPIRED` when read after `expiresAt`.
4. Multi-domain: one user may have many `WordPressSite` rows; each plugin install runs its own connect flow.
5. Localhost domains allowed via existing `normalizeWordPressDomain`.

## Out of scope for first backend PR (frontend/plugin)

- React approve page and editor page UI (backend returns URLs and APIs only).
- PHP plugin implementation (document the contract).
