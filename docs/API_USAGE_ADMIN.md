# Admin API usage report

Only users with the `ADMIN` or `SUPER_ADMIN` role can access request logs and
usage reports.

```http
GET /api/v1/admin/api-requests/usage?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z&source=WEB&outcome=success
Authorization: Bearer <admin-access-token>
```

Without `from` and `to`, the usage action reports the latest 30 days. Supported
filters are:

- `userId`, `authenticated`
- `route`, `routeContains`, `method`
- `statusCode`, `minStatusCode`, `outcome`
- `source`, `errorCode`, `requestId`
- `minDurationMs`, `maxDurationMs`
- `from`, `to`

`outcome` accepts `success`, `redirect`, `client-error`, or `server-error`.
The report returns overall request and transfer usage, error rate, active users,
anonymous traffic, method/source/status distributions, top routes and top users.
Every usage-report view is recorded in the audit log together with its filters.
