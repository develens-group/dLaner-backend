# Dlander backend

Production-oriented NestJS authentication and user-management API backed by PostgreSQL and Prisma. This service intentionally does not persist canvas, scene, template, Excalidraw, browser-cache, payment, credit, or AI-request data.

## Setup

Copy `.env.example` to `.env`, replace both JWT secrets with different cryptographically random values of at least 32 characters, create the PostgreSQL database, then run:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

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
