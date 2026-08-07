# AI history on Cloudflare D1

The `cloudflare-d1` driver stores sanitized AI input/output payloads in a
Cloudflare D1 database through its HTTP API. Operational and financial metadata
stays in PostgreSQL for transactional credit charging and idempotency.

API responses do not change. Payloads are hydrated from D1 on reads. If a D1
write fails, the application stores that payload in PostgreSQL as a safety
fallback.

## Create and initialize D1

Install Wrangler and authenticate:

```powershell
npx wrangler login
npx wrangler d1 create dlander-ai-history
npx wrangler d1 execute dlander-ai-history --remote --file docker/cloudflare-d1-ai-history.sql
```

Copy the displayed database ID and your Cloudflare account ID. Create an API
token with only `Account > D1 > Edit` permission for the relevant account.

```env
AI_HISTORY_STORAGE_DRIVER=cloudflare-d1
AI_HISTORY_D1_ACCOUNT_ID=your-account-id
AI_HISTORY_D1_DATABASE_ID=your-database-id
AI_HISTORY_D1_API_TOKEN=your-restricted-token
AI_HISTORY_RETENTION_DAYS=90
```

Run `npm run retention:cleanup` on a schedule to delete expired D1 payloads and
PostgreSQL metadata. D1 has no DynamoDB-style automatic TTL, so the cleanup job
is required.

On the free plan, D1 currently includes 5 GB total storage, 5 million rows read
per day and 100,000 rows written per day. Each successful AI request normally
uses two D1 writes (insert input, update output), making the practical free-plan
ceiling about 50,000 AI requests per day. Existing PostgreSQL payloads are not
automatically migrated.
