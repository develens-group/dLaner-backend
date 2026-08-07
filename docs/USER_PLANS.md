# User roles and plans

Authorization roles and commercial plans are intentionally separate:

- Roles: `USER`, `REVIEWER`, `ADMIN`, `SUPER_ADMIN`
- Plans: `FREE`, `PRO`, `ENTERPRISE`

Public registration always creates a `USER` with the `FREE` plan. Neither role
nor plan is accepted from the registration payload. This prevents privilege and
paid-plan escalation.

Authenticated admin users can change a plan with:

```http
PATCH /api/v1/admin/users/:userId/plan
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{ "plan": "PRO" }
```

The selected plan is returned by registration, login, `GET /api/v1/users/me`,
and admin user endpoints. Plan changes are recorded in the audit log.
