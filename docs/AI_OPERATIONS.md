# AI operations catalog (real providers)

Fake AI for frontend tests remains at `/api/v1/ai/fake`.

## Credits (millicredits)

Balances and charges are stored as integers ×1000. APIs accept/return up to **3 decimal places** (e.g. `0.002`).

After deploying migration `20260924120000_ai_catalog_millicredits`, existing balances are multiplied by 1000.

## Admin

- `GET/POST /api/v1/admin/ai/operation-types`
- `PATCH/DELETE /api/v1/admin/ai/operation-types/:id`
- `GET/POST /api/v1/admin/ai/provider-variants`
- `PATCH/DELETE /api/v1/admin/ai/provider-variants/:id`
- `POST /api/v1/admin/ai/provider-variants/:id/set-default`
- `GET /api/v1/admin/ai/providers`

Variant fields: `provider` (`replicate` implemented; `openai`/`stability` stubs), `externalModel`, `creditCost` (decimal), `priority`, `isDefault`, `configJson`.

## User

- `GET /api/v1/ai/operations` — active types + variants
- `POST /api/v1/ai/execute` — multipart: `type`, optional `variantId`, optional `prompt`, optional `image`

On provider failure the API returns an error (credits released). Client may retry with another `variantId` of the same type. No server auto-failover.

Set `REPLICATE_API_TOKEN` for Replicate variants.
