# Admin Panel API Contract

Contract for the external admin frontend against this NestJS backend.

Base path: `/api/v1/admin`  
Auth: `Authorization: Bearer <accessToken>`  
Roles: `ADMIN` or `SUPER_ADMIN` (unless noted)  
Envelope: `{ "data": ..., "meta": ... }` via the shared `response()` helper

Swagger: `/api/docs`

Related: [`API_USAGE_ADMIN.md`](API_USAGE_ADMIN.md) (API request telemetry filters), [`http/admin.http`](../http/admin.http)

## Roles

| Actor | Capabilities |
|-------|----------------|
| `ADMIN` | Manage `USER` / `REVIEWER` (create, block, plan, reset password, credits, activity, audit list, dashboard, API/AI logs) |
| `SUPER_ADMIN` | Everything above + create `ADMIN`/`SUPER_ADMIN` + `PATCH .../role` |

Rules:

- Administrators cannot alter themselves
- `ADMIN` cannot alter a `SUPER_ADMIN`
- Only `SUPER_ADMIN` may change roles or assign administrator roles on create

---

## Users

### List

`GET /api/v1/admin/users`

Query:

| Param | Type | Notes |
|-------|------|-------|
| `page` | number | default 1 |
| `limit` | number | 1–100, default 20 |
| `search` | string | email / displayName |
| `role` | `UserRole` | optional |
| `status` | `UserStatus` | optional |
| `plan` | `UserPlan` | optional |

### Get (with credit summary)

`GET /api/v1/admin/users/:userId`

`data` includes user fields plus:

```json
{
  "creditAccount": {
    "availableBalance": 0,
    "reservedBalance": 0,
    "lifetimePurchased": 0,
    "lifetimeConsumed": 0
  }
}
```

### Create

`POST /api/v1/admin/users`

```json
{
  "email": "user@example.com",
  "password": "StrongPass123",
  "displayName": "Name",
  "role": "USER",
  "plan": "FREE"
}
```

- Password: 10–128 chars, upper + lower + digit
- Created as `ACTIVE` with `emailVerifiedAt` set
- Credit account ensured (zero balances)

### Block / unblock / plan

- `POST /api/v1/admin/users/:userId/block`
- `POST /api/v1/admin/users/:userId/unblock`
- `PATCH /api/v1/admin/users/:userId/plan` — body `{ "plan": "PRO" }`

### Change role (SUPER_ADMIN only)

`PATCH /api/v1/admin/users/:userId/role`

```json
{ "role": "REVIEWER" }
```

### Reset password

`POST /api/v1/admin/users/:userId/reset-password`

```json
{ "newPassword": "StrongPass123" }
```

Revokes all active sessions. Audit: `admin.user.reset_password`.

---

## User activity timeline

`GET /api/v1/admin/users/:userId/activity`

Query:

| Param | Notes |
|-------|-------|
| `limit` | 1–100, default 30 |
| `cursor` | opaque `nextCursor` from previous page |
| `types` | `audit`, `credit`, `api_request`, `ai_request`, `session` (repeatable or comma-separated) |

Item shape:

```json
{
  "id": "uuid",
  "type": "credit",
  "occurredAt": "2026-08-28T12:00:00.000Z",
  "summary": "ADMIN_GRANT 100",
  "metadata": {}
}
```

`meta.nextCursor` is `null` when there is no further page.

Sources (no separate activity table): AuditLog (target user), CreditLedgerEntry, ApiRequestRecord, AiRequest, Session (`createdAt` = session start).

---

## Audit logs (admin actions)

`GET /api/v1/admin/audit-logs`

Query: `page`, `limit`, `action`, `actorId`, `targetType`, `targetId`, `from`, `to` (ISO date strings)

Read-only. Sensitive writes already record actions such as:

- `admin.user.created`
- `admin.user.role_changed`
- `admin.user.reset_password`
- `user.blocked` / `user.unblocked` / `user.plan_changed`
- credit adjustment audits (existing)

---

## Credits

Under `/api/v1/admin`:

| Method | Path |
|--------|------|
| CRUD | `/credit-packages` |
| GET | `/credit-accounts`, `/credit-accounts/:userId`, `/credit-accounts/:userId/transactions` |
| POST | `/credit-accounts/:userId/grant` |
| POST | `/credit-accounts/:userId/deduct` |
| POST | `/credit-accounts/:userId/refund` |
| POST | `/credit-accounts/:userId/reconcile` |
| GET | `/credit-orders`, `/credit-orders/:orderId` |

Grant / deduct body:

```json
{
  "amount": 100,
  "reason": "Support adjustment",
  "idempotencyKey": "unique-key-per-operation"
}
```

---

## API requests & AI

- `GET /api/v1/admin/api-requests` (+ `stats`, `:requestId`) — see [`API_USAGE_ADMIN.md`](API_USAGE_ADMIN.md)
- `GET /api/v1/admin/ai-requests` (+ `stats`, `:id`)

---

## Dashboard

`GET /api/v1/admin/dashboard?days=7|30|90` (default 30)

Aggregates users, templates, orders, credits, recent items, audit count.

---

## Errors

| Status | When |
|--------|------|
| 400 | Validation (password, role, cursor, amounts) |
| 403 | Role policy / cannot alter self or SUPER_ADMIN |
| 404 | User not found |
| 409 | Duplicate email on create |

---

## Suggested panel screens

1. Dashboard → `GET /dashboard`
2. Users table → `GET /users` with filters
3. User detail → get + activity + credit transactions + grant/deduct
4. Audit → `GET /audit-logs`
5. Packages / orders / API & AI usage → existing admin routes
