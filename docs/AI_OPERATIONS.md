# AI operations catalog (real providers)

Fake AI for frontend tests remains at `/api/v1/ai/fake`.

## Credits (high-precision decimal)

Balances and charges are stored as `DECIMAL(36, 18)`.

- API accepts number or decimal **string** (prefer string for very long fractions).
- Up to **18** fractional digits (database limit — not capped at 3).
- Responses format credit fields as strings to preserve precision (e.g. `"0.000000123"`).

Migrations:

1. `20260924120000_ai_catalog_millicredits` — catalog + temporary ×1000 scale  
2. `20260924180000_credits_decimal_precision` — convert to DECIMAL and undo ×1000

## Admin

- `GET/POST /api/v1/admin/ai/operation-types`
- `PATCH/DELETE /api/v1/admin/ai/operation-types/:id`
- `GET/POST /api/v1/admin/ai/provider-variants`
- `PATCH/DELETE /api/v1/admin/ai/provider-variants/:id`
- `POST /api/v1/admin/ai/provider-variants/:id/set-default`
- `GET /api/v1/admin/ai/providers`

Variant `creditCost` is a decimal string/number (not milli).

## User

- `GET /api/v1/ai/operations`
- `POST /api/v1/ai/execute` — multipart: `type`, optional `variantId`, optional `prompt`, optional `image`

On provider failure credits are released; client retries with another `variantId`.

Set `REPLICATE_API_TOKEN` for Replicate variants.
