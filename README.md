# Dlander Backend

Production-oriented REST API built with NestJS, PostgreSQL, Prisma and Swagger. It provides authentication, request and AI history, and immutable-ledger credit accounting.

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

### 1. Clone and enter the project

```bash
git clone https://github.com/develens-group/dLaner-backend.git
cd dLaner-backend
```

### 2. Create the environment file

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with two different random values of at least 32 characters. For the included Docker database, keep:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dlander?schema=public
AUTH_REFRESH_TOKEN_TRANSPORT=body
```

Never commit the `.env` file or real secrets.

### 3. Start PostgreSQL and Mailpit

Make sure Docker Desktop is running, then execute:

```bash
docker compose up -d
docker compose ps
```

This starts PostgreSQL on `localhost:5432` and the Mailpit inbox on [http://localhost:8025](http://localhost:8025).

### 4. Install, migrate and start

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

On Windows PowerShell, if script execution is disabled for `npm.ps1`, use the `.cmd` executables:

```powershell
npm.cmd install
npx.cmd prisma generate
npx.cmd prisma migrate deploy
npm.cmd run start:dev
```

After NestJS starts, open:

| Service | URL |
| --- | --- |
| Swagger UI | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) |
| OpenAPI JSON | [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json) |
| API | [http://localhost:3000](http://localhost:3000) |
| Mailpit inbox | [http://localhost:8025](http://localhost:8025) |

### Using protected endpoints in Swagger

1. Register with `POST /api/v1/auth/register`.
2. Open Mailpit, copy the verification token and verify the account.
3. Log in with `POST /api/v1/auth/login`.
4. Copy the returned `accessToken`.
5. Click **Authorize** in Swagger and paste only the token, without the `Bearer ` prefix.

Swagger retains the authorization value across page refreshes in development.

### Start again later

After the first installation, these commands are normally enough:

```bash
docker compose up -d
npm run start:dev
```

Stop NestJS with `Ctrl+C`. Stop the local containers without deleting database data:

```bash
docker compose down
```

## Configuration

Required settings are `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `EMAIL_VERIFICATION_EXPIRES_IN`, `PASSWORD_RESET_EXPIRES_IN`, and `FRONTEND_URL`. `CORS_ORIGINS` is a comma-separated allowlist. See `.env.example` for SMTP, port, cookie, and transport options.

## Authentication flows

- Registration (`POST /api/v1/auth/register`) normalizes email, hashes the password with Argon2id, creates a pending user and a hashed one-time verification token, and emails the raw token link.
- Verification and resend use `/verify-email` and `/resend-verification`. Reissue invalidates older tokens and both endpoints are throttled.
- Login creates one independent database session and returns a short-lived access JWT plus rotating refresh JWT. Access authentication checks the user status and session revocation on every request.
- Refresh (`POST /api/v1/auth/refresh`) verifies the refresh JWT, checks its Argon2 hash, and atomically replaces it under a serializable transaction. A mismatch revokes the session as reuse detection.
- Logout revokes the current session; logout-all revokes every active user session.
- Forgot-password always returns the same response. Reset tokens are hashed, expiring, one-use values; a successful reset atomically changes the password and revokes all sessions.
- Change-password keeps the current session and revokes all other sessions. This avoids unexpectedly signing out the initiating device while limiting stolen-session persistence.

All protected endpoints use `Authorization: Bearer <access-token>`.

## Refresh-token transport

Set `AUTH_REFRESH_TOKEN_TRANSPORT=body` for development clients. The refresh token is then returned in JSON and supplied as `refreshToken` to `/refresh`; this is convenient but exposes it to JavaScript and therefore XSS.

Set it to `cookie` in production. The API places the token in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth` and omits it from JSON. Cookie mode requires HTTPS. Keep the CORS allowlist narrow and use credentialed requests. SameSite strict is the primary CSRF control for this deployment model.

## Users, sessions, and roles

`GET/PATCH/DELETE /api/v1/users/me` reads, updates the display name, or soft-deletes the account. Deletion preserves records and revokes all sessions. `/api/v1/users/me/sessions` lists active sessions without hashes and marks the current one; an individual owned session can be revoked by ID.

`ADMIN` and `SUPER_ADMIN` may search/page through `/api/v1/admin/users`, inspect a user, and block/unblock accounts. `ADMIN` cannot modify `SUPER_ADMIN`; administrators cannot block themselves. Block revokes sessions. Administrative mutations call the audit abstraction and currently emit structured audit log events.

## Development email

The mail abstraction sends through SMTP. Start Mailpit on ports 1025 (SMTP) and 8025 (web UI), retain the `.env.example` SMTP defaults, and view messages at `http://localhost:8025`. Production should supply authenticated TLS SMTP configuration.

## API and tests

Swagger UI is at `http://localhost:3000/api/docs`; its OpenAPI document is available at `/api/docs-json`.

```bash
npm run lint
npm test
npm run test:e2e
npm run build
npx prisma validate
npx prisma migrate status
```

Integration tests that exercise PostgreSQL should use a dedicated PostgreSQL `DATABASE_URL`; SQLite is not supported. The migration is committed under `prisma/migrations`.

## Security decisions

Passwords and refresh tokens use Argon2; one-time email/reset tokens use SHA-256 because they contain 256 bits of randomness and are compared by exact indexed digest. DTO payloads are transformed, whitelisted, and reject extra fields. Authentication failures avoid credential enumeration, secrets/hashes are never serialized, sensitive endpoints are throttled, CORS is allowlisted, Helmet is enabled, and the API uses consistent `{ data, meta }` success envelopes and `{ error, meta }` failures. Authentication request bodies are not logged.

## Request tracking, audit, and AI history

These are separate concerns:

- Access logs are structured operational events containing request ID, normalized route, timing, sizes, status, safe client metadata, and authenticated user/session IDs. They never contain headers, cookies, bodies, prompts, or response bodies.
- `ApiRequestRecord` is retained HTTP metadata. Unknown routes are metadata-only. Approved authentication routes retain normalized email only; password/token routes and AI creation bodies are omitted.
- `AuditLog` is the durable security trail for administrative detail views, user administration, and retention cleanup.
- `AiRequest` is domain history for provider lifecycle, optional prompt/output storage, usage, latency, and stable input hashes. It is not a credit ledger.

Every response returns `X-Request-Id`. A valid client value is reused; malformed values are replaced with UUIDs. The recursive sanitizer redacts password, token, authorization, cookie, API-key, provider-secret, payment-token, card-number, and CVV fields. Strings, arrays, nesting, and serialized sizes are bounded and truncation/omission flags are persisted.

Persistence exclusions are `/`, `/health/live`, `/health/ready`, Swagger/static assets, and `OPTIONS`. They still receive request IDs and access logs.

No Redis/BullMQ infrastructure existed, so sanitized records use a bounded asynchronous in-process buffer after response completion. Inserts retry three times and upsert by request ID. Saturation is logged and uses sanitized direct persistence; final loss is explicitly logged. `API_REQUEST_PERSISTENCE_MODE=sync` is the deterministic test adapter. Shutdown hooks flush queued work.

Run retention from a scheduler:

```bash
npm run retention:cleanup
```

It deletes only expired API-request and AI-history rows, never audit, financial, security, or billing records.

Relevant environment variables are `LOG_LEVELS`, `TRUST_PROXY`, `API_REQUEST_STORAGE_ENABLED`, `API_REQUEST_BODY_CAPTURE_ENABLED`, `API_REQUEST_RETENTION_DAYS`, `API_REQUEST_MAX_BODY_BYTES`, `API_REQUEST_MAX_QUERY_BYTES`, `API_REQUEST_PERSISTENCE_MODE`, `API_REQUEST_QUEUE_MAX_SIZE`, `API_REQUEST_CAPTURE_IP`, `AI_HISTORY_STORE_INPUT`, `AI_HISTORY_STORE_OUTPUT`, `AI_HISTORY_MAX_INPUT_BYTES`, `AI_HISTORY_MAX_OUTPUT_BYTES`, `AI_HISTORY_RETENTION_DAYS`, and `AI_PROVIDER_TIMEOUT_MS`.

Administrative routes are `/api/v1/admin/api-requests`, `/api/v1/admin/api-requests/stats`, `/api/v1/admin/api-requests/:requestId`, `/api/v1/admin/ai-requests`, `/api/v1/admin/ai-requests/stats`, and `/api/v1/admin/ai-requests/:id`. Lists use bounded cursor pagination; API-request filters cover user, route, method, status, error, source, request ID, and date.

The `AiProvider` abstraction returns normalized output and optional usage. The built-in `mock` provider requires no paid account:

```json
{
  "provider": "mock",
  "model": "mock-1",
  "operation": "CHAT",
  "input": { "prompt": "Hello" }
}
```

Send this to `POST /api/v1/ai/requests` with an optional `Idempotency-Key`. Users can list, inspect, and cancel only their own records. Cancellation succeeds only while CREATED or QUEUED. Use `simulateFailure: true` to test normalized provider failures.

For troubleshooting, run `npx prisma validate`, `npx prisma migrate status`, `npm run retention:cleanup`, and `npm test -- --runInBand`. If `api_request_persistence_failed` appears, check PostgreSQL connectivity and buffer sizing.

## Credits and payments

Each user receives a `CreditAccount` lazily and idempotently on their first credit operation. Credits and monetary minor units are signed 32-bit integers; JavaScript floating point and BigInt serialization are not used. `CREDIT_MAX_TRANSACTION_AMOUNT` limits individual mutations below the database range.

The account cache exposes:

- `available`: immediately spendable credits
- `reserved`: credits held for in-progress work
- `total`: available plus reserved

`CreditLedgerEntry` is the immutable financial source of truth. Every mutation creates a ledger entry in the same serializable PostgreSQL transaction as the optimistic-version account update. Balances cannot become negative. Ledger entries are never edited or deleted; refunds and reconciliation use compensating entries.

```mermaid
flowchart LR
  Package[Credit package] --> Order[Snapshotted purchase order]
  Order --> Attempt[Payment attempt]
  Attempt --> Webhook[Signed provider webhook]
  Webhook --> Verify[Server-side verification]
  Verify --> Paid[Order PAID]
  Paid --> Ledger[PURCHASE ledger entry]
  Ledger --> Account[Versioned account cache]
```

Credit package values and price are always loaded from PostgreSQL and copied into the order. Client-supplied prices or credit amounts are ignored. The built-in `mock` payment provider creates development redirects, verifies its own payment identifiers, and requires an HMAC-SHA256 `X-Payment-Signature` over the stable payload hash. Disable it with `MOCK_PAYMENT_ENABLED=false`.

Payment webhooks are sent to `POST /api/v1/payments/webhooks/mock`. Provider/event identity is unique, invalid signatures are recorded without payload secrets, duplicate processed events are acknowledged without charging again, and payment completion atomically updates the order, attempt, webhook, account, and PURCHASE ledger entry.

### Idempotency scopes

- Orders: user plus `Idempotency-Key`
- Ledger operations: user plus ledger type plus idempotency key
- Reservations: user plus idempotency key
- Webhooks: provider plus provider event ID

Stored request hashes reject reuse with different amounts or references. Financial operations use serializable transactions, conditional balance/version updates, unique constraints, and retries for PostgreSQL serialization conflicts.

### AI credit flow

```mermaid
sequenceDiagram
  participant User
  participant AI
  participant Credits
  participant Provider
  User->>AI: create request
  AI->>Credits: estimate and reserve
  Credits-->>AI: reservation
  AI->>Provider: execute
  Provider-->>AI: output and usage
  AI->>Credits: capture actual cost
  Credits->>Credits: release unused reservation
  AI-->>User: completed history record
```

The configuration-backed `CreditCostCalculator` applies a fixed integer cost plus ceiling-rounded input/output units. Reservation happens before provider execution. Success captures actual cost and returns unused credits; non-billable failure releases the reservation. If a provider succeeds but credit capture fails, the reservation remains recoverable and the AI record is marked `CREDIT_CAPTURE_FAILED` for reconciliation.

### Refunds and reconciliation

Administrative purchase refunds must reference a paid order. The serializable refund operation sums prior refunds, rejects over-refunds, writes a compensating REFUND entry, and marks the order REFUNDED after a full refund. `/api/v1/admin/credit-accounts/:userId/reconcile` reports cached-versus-ledger balances without silently repairing them.

User routes:

- `/api/v1/credits/balance`
- `/api/v1/credits/transactions`
- `/api/v1/credits/reservations`
- `/api/v1/credits/packages`
- `/api/v1/credits/orders`
- `/api/v1/credits/orders/:orderId/start-payment`
- `/api/v1/credits/orders/:orderId/cancel`

Administrative routes include credit-package CRUD, account and ledger views, grant/deduct/refund actions, reconciliation, and order history under `/api/v1/admin`. Adjustments require a reason and idempotency key and emit durable audit events.

Required credit/payment settings are `DEFAULT_CURRENCY`, `CREDIT_MAX_TRANSACTION_AMOUNT`, `CREDIT_RESERVATION_TTL_SECONDS`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_RETURN_URL`, `PAYMENT_CANCEL_URL`, `MOCK_PAYMENT_ENABLED`, `AI_CREDIT_CHARGING_ENABLED`, and the `AI_CREDIT_*` rate settings shown in `.env.example`.

No raw card data, CVV, payment token, signature, API key, or provider secret is stored or returned. Generic request records remain metadata-only for payment routes, and API-request retention never touches ledger, orders, attempts, webhook identities, or audit records.

## Local API testing

### 1. Start PostgreSQL and Mailpit

Install Docker Desktop, ensure its engine is running, then execute from the repository root:

```bash
docker compose up -d
docker compose ps
```

PostgreSQL is exposed at `localhost:5432`. The container initializes two separate databases:

- `dlander` for local development
- `dlander_test` exclusively for automated e2e tests

Mailpit SMTP is available at `localhost:1025`; its inbox UI is [http://localhost:8025](http://localhost:8025).

### 2. Configure and migrate the development database

Copy `.env.example` to `.env`, replace the documented development secrets, and retain the `dlander` database name:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

Never point `.env.test.local` at the development or production database. The reset script refuses non-local hosts and database names that do not end in `_test`.

### 3. Start NestJS and Swagger

```bash
npm run start:dev
```

Open [http://localhost:3000/api/docs](http://localhost:3000/api/docs). Click **Authorize** and paste the JWT access token without a `Bearer ` prefix. In development, Swagger keeps the authorization value in browser storage across page refreshes.

### 4. Send VS Code REST Client requests

Install the VS Code extension **REST Client** (`humao.rest-client`). Open any file under `http/`, select the `local` REST Client environment, and click **Send Request** above an example.

The committed `http/http-client.env.json` contains placeholders only. Tokens returned by `auth.http` can be stored as VS Code REST Client global variables for the current editor session. For persistent private values, create `http/http-client.private.env.json`; it is ignored by Git. Never commit real passwords, JWTs, refresh tokens, payment signatures, or verification/reset tokens.

Recommended sequence:

1. Run registration in `http/auth.http`.
2. Open Mailpit and copy the verification token.
3. Verify and log in.
4. Paste or capture the access/refresh tokens.
5. Use `users.http`, `ai.http`, `credits.http`, `api-requests.http`, and `admin.http`.

The collections include successful requests and common validation, authentication, ownership, package, provider, and RBAC errors.

### 5. Run unit and e2e tests

Create the private test configuration once:

```powershell
Copy-Item .env.test.example .env.test.local
```

On macOS/Linux:

```bash
cp .env.test.example .env.test.local
```

Then run:

```bash
npm test
npm run test:db:reset
npm run test:e2e
npm run test:e2e:watch
npm run test:e2e:cov
```

`test:e2e` and `test:e2e:cov` reset `dlander_test` before Jest starts. `test:e2e:watch` deliberately does not reset on every rerun; run `npm run test:db:reset` before starting watch mode. The e2e application loads `.env.test.local`, verifies the local `_test` database again, starts the real `AppModule`, and applies the same validation, exception, security, request-ID, and Swagger setup as the running API.

To stop local services:

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete both local database volumes and recreate them from scratch.
