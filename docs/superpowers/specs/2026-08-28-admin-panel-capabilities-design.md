# Admin Panel Capabilities — Design

Date: 2026-08-28  
Status: approved (pending implementation)

## Goal

Complete backend gaps so an external admin frontend can manage users, credits, activity, and admin audit — plus ship an API contract document for that panel.

This repo remains backend-only; no admin UI is built here.

## Context (existing)

Already available under `/api/v1/admin` (role-gated `ADMIN` | `SUPER_ADMIN`):

- Users: list/search, get, block/unblock, change plan
- Credits: packages, accounts, grant/deduct/refund/reconcile, orders, ledger
- API request logs + stats
- AI request admin list/stats
- Dashboard aggregates
- Audit **writes** via `AuditService.record` (no list API today)

Credit balance lives on `CreditAccount` (lazy `getOrCreateAccount`), not on `User`.

## Non-goals

- Admin frontend / in-repo UI
- Fine-grained permission matrix (CASL/ACL) beyond roles
- New `UserActivity` table / dual-write event store
- Soft-delete/restore user, session browser UI APIs
- `mustChangePassword` flag (not in schema; YAGNI)
- Changing existing credit grant/deduct URL contracts

## Decisions

| Topic | Decision |
|-------|----------|
| Approach | Extend existing `admin`, `audit`, and related modules; keep current credit/API/AI endpoints |
| User activity | Unified timeline endpoint that merges existing sources |
| Admin audit | Separate read/list API over `AuditLog` |
| User management scope | Filters + rich get + create user + reset password + change role |
| Role policy | Only `SUPER_ADMIN` may change roles or create `ADMIN`/`SUPER_ADMIN`; normal `ADMIN` manages `USER`/`REVIEWER` only |
| Credit account on admin create | Ensure account exists (create zero balance in same flow / `getOrCreateAccount`) so detail responses are consistent |
| Admin-created user status | `ACTIVE` + set `emailVerifiedAt` now (skip email verification flow) |
| Password reset by admin | Set new password (same validation as project auth) + revoke all sessions |
| Docs | New `docs/ADMIN_PANEL_API.md` + update `http/admin.http` (+ short README pointer) |

## Architecture

No new heavy module. Responsibilities:

| Area | Responsibility |
|------|----------------|
| `admin` | Create user, reset password, change role, list filters, enriched get, activity timeline orchestration |
| `audit` | List/query `AuditLog` for admin panel |
| `credits` / `request-tracking` / `ai` | Unchanged contracts; referenced from panel docs |
| Docs | Panel-oriented API contract |

Timeline reads (no new table):

1. `AuditLog` where target is the user (and relevant actions)
2. `CreditLedgerEntry` for that user
3. `ApiRequestRecord` for that user
4. `AiRequest` for that user
5. `Session` rows for that user: use `createdAt` as login/session-start events (`type: session`); do not invent synthetic login events beyond session records

Items normalized to a common shape, sorted by `occurredAt` desc, paginated with a composite cursor (time + id). Over-fetch per source then merge/sort in the service is acceptable for v1 admin scale.

## Role rules

Extend current `assertCanAlter` (no self-alter; `ADMIN` cannot alter `SUPER_ADMIN`):

| Action | `ADMIN` | `SUPER_ADMIN` |
|--------|---------|---------------|
| List / get / activity / audit list / credits / block / plan | Yes (subject to alter rules on mutations) | Yes |
| Create `USER` / `REVIEWER` | Yes | Yes |
| Create `ADMIN` / `SUPER_ADMIN` | No → 403 | Yes |
| Change role | No → 403 | Yes |
| Reset password | Yes if can alter target | Yes if can alter target |
| Alter self | No | No (cannot demote/block/reset self via these admin tools) |

Audit every sensitive mutation (`admin.user.created`, `admin.user.role_changed`, `admin.user.reset_password`, existing block/plan/credit audits).

## API contract (new / extended)

Base: `/api/v1/admin`  
Auth: Bearer JWT  
Roles: `@Roles(ADMIN, SUPER_ADMIN)` unless noted  
Envelope: existing `response(data, meta)`

### Users — `/users`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/users` | Add query filters: `role`, `status`, `plan` (keep `search`, `page`, `limit`) |
| GET | `/users/:userId` | Include summary `creditAccount` (`availableBalance`, `reservedBalance`, lifetime fields as useful) |
| POST | `/users` | Body: `email`, `password`, `displayName?`, `role`, `plan?` (default FREE) |
| PATCH | `/users/:userId/role` | Body: `{ "role": UserRole }` — **SUPER_ADMIN only** |
| POST | `/users/:userId/reset-password` | Body: `{ "newPassword": string }` — revoke sessions |

### Activity & audit

| Method | Path | Notes |
|--------|------|-------|
| GET | `/users/:userId/activity` | Query: `limit`, `cursor`, optional `types` (`audit`, `credit`, `api_request`, `ai_request`, `session`) |
| GET | `/audit-logs` | Query: `action`, `actorId`, `targetType`, `targetId`, `from`, `to`, pagination |

### Activity item shape

```json
{
  "id": "string",
  "type": "audit | credit | api_request | ai_request | session",
  "occurredAt": "ISO-8601",
  "summary": "human-readable short string",
  "metadata": {}
}
```

### Existing endpoints (document for panel; do not break)

- `POST /credit-accounts/:userId/grant` | `deduct` | `refund` | `reconcile`
- `GET /credit-accounts`, `/:userId`, `/:userId/transactions`
- `GET|POST|PATCH|DELETE` credit packages; credit orders
- `POST /users/:userId/block` | `unblock`; `PATCH /users/:userId/plan`
- `GET /api-requests`, stats, usage report
- `GET /ai-requests`, stats
- `GET /dashboard`

## Errors

| Case | Status |
|------|--------|
| Role policy violation | 403 |
| User not found | 404 |
| Duplicate email on create | 409 |
| Invalid body / weak password / invalid role | 400 |

## Documentation deliverables

1. `docs/ADMIN_PANEL_API.md` — grouped contract for frontend (users, credits, activity, audit, API/AI, dashboard), auth/roles, example payloads
2. Update `http/admin.http` with new calls
3. Short README link to the admin panel API doc

## Testing

- Create user: ADMIN cannot create ADMIN/SUPER_ADMIN; SUPER_ADMIN can
- Reset password: hash updated; sessions revoked; audit written
- Change role: only SUPER_ADMIN; cannot use to bypass alter rules on SUPER_ADMIN targets for ADMIN actors
- List filters by role/status/plan
- Enriched get includes credit summary (account created if missing)
- Activity: empty + mixed sources ordering
- Audit list: filters and pagination

## Implementation notes

- Prefer reusing password hashing (argon2id) and validation DTOs from auth where practical
- Activity merge can over-fetch per source then merge/sort in service for v1 (acceptable scale for admin tools); document cursor semantics clearly
- Do not invent new permission strings; keep `UserRole` enum only
