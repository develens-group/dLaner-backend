# Social login and explicit account linking

Google, GitHub, and Facebook are optional. No provider is enabled until its backend credentials and fixed callback origin are configured. Password sign-in is unchanged. Provider client secrets belong only in backend environment variables.

## Deployment

1. Install existing dependencies and generate Prisma Client (`npm install`; postinstall runs Prisma generate).
2. Apply the reviewed additive migration with `npm run db:migrate:deploy` during deployment. Migration: `20261107120000_social_auth`. Local implementation and tests do not apply this migration to any database.
3. Configure `FRONTEND_URL=https://dlander.com` and `OAUTH_CALLBACK_BASE_URL=https://mcp.dlander.com` (origins only).
4. Configure client credentials for each desired provider; leave unused pairs blank:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_GRAPH_API_VERSION=
```

Facebook requires an explicit supported Graph API version from the Meta app dashboard. There is no silently chosen version. Existing mail transport configuration (SMTP or Resend) must be functional for local email verification. Register these exact redirect URIs in provider dashboards:

- Google: `https://mcp.dlander.com/api/v1/auth/social/google/callback`
- GitHub: `https://mcp.dlander.com/api/v1/auth/social/github/callback`
- Facebook: `https://mcp.dlander.com/api/v1/auth/social/facebook/callback`

For development use separate provider apps/redirect URLs with the local backend origin and local `FRONTEND_URL`; production callbacks deliberately do not redirect to arbitrary preview or localhost URLs.

## API contract

Responses use the normal `{data, meta}` envelope.

- `GET /api/v1/auth/social/providers`: `{providers: ['google', ...]}` with enabled IDs only.
- `POST /api/v1/auth/social/:provider/start`: `{codeChallenge, clientState}` returns `{authorizationUrl}`. Both fields are base64url; S256 challenge is 43 characters and client state 43–128.
- `POST /api/v1/auth/social/:provider/link`: same payload, authenticated WEB session required. The attempt binds both user and initiating session.
- Provider `GET` callback redirects to fixed `${FRONTEND_URL}/auth/social/callback#code=...&state=...` or a safe error enum and state. An invalid or unknown provider state is never reflected as trusted client state.
- `POST /api/v1/auth/social/exchange`: `{code, codeVerifier}` returns the normal authentication result. Existing body/cookie refresh-token transport is preserved.

Provider access/refresh tokens never enter URLs, the database, or the app login result. Provider state is random and hashed in the database; attempts expire after 10 minutes. Google/GitHub also use a separate backend-generated provider PKCE verifier. The frontend grant expires after 90 seconds and is redeemed only with the original frontend PKCE verifier. Attempts and grants are atomically single-use. Provider profile candidates cause no account mutations until the frontend proves PKCE ownership. The flow intentionally does not depend on cookies shared between the frontend `/gateway` proxy and direct backend callback domain.

## Account and email rules

- Stable provider subject IDs identify social accounts. Email matches never silently merge existing accounts. Users with an existing account sign in using that account's method, then explicitly link in account settings.
- New users receive the database defaults USER/FREE, with a random unknown argon2 password hash. Active social users can use the ordinary email password-reset flow to set their own password later.
- Google must return strict boolean `email_verified=true`. Gmail and matching Google-hosted (`hd`) domains are accepted for immediate signup. External Google email requires local mailbox verification.
- GitHub must return a verified primary email (including private email through `user:email`).
- Facebook email is not treated as current-mailbox proof. A new user is PENDING_VERIFICATION, receives the existing email OTP, and receives no auth session until verification. Missing provider email is rejected clearly.
- Local verification works even when `EMAIL_VERIFICATION_REQUIRED=false` for password signup. Existing pending social accounts can resend the OTP through the normal verification screen. An old OTP cannot reactivate BLOCKED/DELETED users.
- Explicit linking requires a currently active, unrevoked, unexpired WEB session. An unverified local mailbox must be proved by OTP unless the authenticated provider supplies a trusted exactly matching email. No identity is attached until that proof is complete. WordPress installation sessions cannot initiate web-account linking.
- Linked users must still be ACTIVE and not deleted whenever a session is issued. Provider details cannot choose a role or plan.

Errors use safe lowercase `error.code` values, including `account_exists`, `identity_in_use`, `email_verification_required`, `email_unavailable`, `email_not_verified`, `invalid_state`, and `account_unavailable`. The frontend must handle both callback errors and exchange errors. Codes, state, PKCE values, and token variants are redacted from request tracking. Run `npm run retention:cleanup` on the existing maintenance schedule to remove expired attempts and grants.

## Validation

Unit tests cover provider profile policies, PKCE and replay failures, provider mix-up, same-email collisions, blocked accounts, revoked/restricted link sessions, explicit account ownership, and OTP behavior independent of password-signup settings. Live provider success/cancellation tests require real provider apps, credentials, working email delivery, the migration, and the deployed frontend callback. No real OAuth approval, deployment, or production database change is performed by these tests.
