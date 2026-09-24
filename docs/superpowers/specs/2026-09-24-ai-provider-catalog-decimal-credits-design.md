# AI Provider Catalog + Decimal Credits — Design

**Date:** 2026-09-24  
**Status:** Approved for planning

## Goal

Connect the product to real AI image APIs while keeping the existing fake AI endpoints for testing. Admins manage operation types and multiple provider variants per type (credit cost, priority, default). Credits support three decimal places for costs and user balances.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Fake AI | Keep `/api/v1/ai/fake` unchanged for tests |
| Admin catalog | DB-backed CRUD for types + variants |
| Multiple APIs per type | Yes (e.g. several remove-background variants) |
| Default | Admin sets one default variant per active type |
| User choice | Client may send `variantId`; omit → use default |
| Failover | No server auto-failover; return error; frontend retries with another variant |
| Providers v1 | Multi-provider registry skeleton; **Replicate fully implemented**; others stub |
| Custom HTTP admin | Out of v1 |
| Credit storage | **Millicredits** (integer ×1000); API exposes 3 decimal places |
| Credit example | `0.002` credits → store `2` |

## Non-goals (v1)

- Admin-defined generic HTTP/webhook adapters
- Automatic server-side failover across variants
- Full adapters for non-Replicate providers
- Changing fake AI catalog to read from DB
- Storing canvas drop images on cloud (unchanged policy)

## Data model

### `AiOperationType`

Logical operation the product exposes (align slugs with fake types where useful).

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `slug` | Unique, e.g. `remove-background` |
| `label` | Display name |
| `description` | Optional |
| `isActive` | Soft hide from users |
| `sortOrder` | Catalog ordering |
| timestamps | created/updated |

### `AiProviderVariant`

One concrete API/model under a type.

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `typeId` | FK → `AiOperationType` |
| `provider` | Enum/string: `replicate` (+ reserved stubs) |
| `externalModel` | Provider model id, e.g. `men1scus/birefnet` |
| `label` | Admin/user-facing name |
| `creditCostMilli` | Int ≥ 0; milli-credits |
| `priority` | Int; lower = higher in list |
| `isDefault` | At most one `isDefault && isActive` per type (enforced in service) |
| `isActive` | |
| `configJson` | Optional provider-specific mapping (input keys, version, etc.) |
| timestamps | |

Indexes: `(typeId, isActive)`, `(typeId, isDefault)`, `(provider)`.

### Credits (millicredits)

All existing credit `Int` columns keep type `Int` but **change meaning** to millicredits:

- `CreditAccount.availableBalance`, `reservedBalance`, `lifetimePurchased`, `lifetimeConsumed`
- `CreditLedgerEntry.amount`, deltas, balances-after
- `CreditReservation.amount`, `capturedAmount`
- `CreditPackage.creditAmount`, `bonusCreditAmount`
- `CreditPurchaseOrder` credit amount fields
- `AiRequest.estimatedCreditCost`, `chargedCreditAmount`, `actualCreditCost` (and related)

**Migration:** multiply every existing credit integer by `1000` in a data migration. Document that pre-migration `1` credit becomes `1.000` displayed (`1000` milli).

**API layer:**

- Inbound admin/user amounts: decimal string/number with max 3 fraction digits → `Math.round(value * 1000)`
- Outbound: `milli / 1000` formatted to 3 decimals (or number with fixed scale)
- Reject more than 3 decimal places

Packages, grants, spends, reservations, and AI charges all use the same conversion helpers.

## Provider registry

```
AiProviderAdapter {
  readonly id: string  // 'replicate' | ...
  execute(variant, input): Promise<AiExecutionResult>
}
```

- Registry maps `provider` → adapter
- Missing / stub adapter → clear `PROVIDER_NOT_IMPLEMENTED` error (no charge capture)
- Replicate adapter: platform API token from config (`REPLICATE_API_TOKEN` or admin-managed secret store if already patterned); runs prediction for `externalModel`; maps multipart/fields via `configJson` + type defaults
- Output normalized for image ops: at least `{ imageUrl }` (or binary URL) consistent with fake responses where practical

## Execution flow (real)

1. Auth user calls execute with `type` slug + optional `variantId` + operation fields (multipart/JSON as defined per type).
2. Load active type; resolve variant (`variantId` or default active for type).
3. If billing platform credits: `reserveCredits(user, variant.creditCostMilli, ...)`.
4. Call adapter; persist `AiRequest` (extend/link `variantId` if useful).
5. Success → capture reservation for actual cost (v1: equal to reserved fixed cost).  
   Failure → release reservation; return error payload (provider message/code). Frontend may call again with another `variantId`.
6. Do **not** automatically try the next priority variant on the server.

Idempotency: reuse existing AI idempotency patterns where present.

## Fake AI

- Remains on `/api/v1/ai/fake` (+ list types).
- Static catalog and fixed integer costs in fake module may stay as-is for tests **or** display milli-compatible numbers only if tests break—prefer zero behavior change for fake.
- Real catalog is independent; frontend uses fake only in test mode.

## Admin API (sketch)

Base: `/api/v1/admin/ai` (ADMIN / SUPER_ADMIN).

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/operation-types` | List / create |
| GET/PATCH/DELETE | `/operation-types/:id` | Read / update / soft-deactivate or delete if unused |
| GET/POST | `/provider-variants` | List (filter by type) / create |
| GET/PATCH/DELETE | `/provider-variants/:id` | Update cost, priority, default, active, model, config |
| POST | `/provider-variants/:id/set-default` | Atomically clear other defaults for type |
| GET | `/providers` | Built-in provider ids + implementation status |

Credit fields in admin DTOs accept decimals (3 places); store milli.

Audit: record admin mutations via existing audit service.

## User API (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/ai/operations` | Active types with active variants (decimal costs, default, priority, provider label) |
| POST | `/api/v1/ai/execute` | Run real pipeline (`type`, optional `variantId`, inputs) |

Existing generic `AiService` create/execute may be wrapped or gradually aligned; v1 may add a dedicated execute path wired to the catalog to avoid breaking current provider/model DTO clients. Prefer one clear user-facing execute for the land editor.

Credits balance endpoints return decimal display values.

## Error codes (examples)

- `AI_TYPE_NOT_FOUND` / `AI_TYPE_INACTIVE`
- `AI_VARIANT_NOT_FOUND` / `AI_VARIANT_INACTIVE`
- `AI_NO_DEFAULT_VARIANT`
- `PROVIDER_NOT_IMPLEMENTED`
- `AI_PROVIDER_FAILED` (include safe provider message)
- `INSUFFICIENT_CREDITS` (existing)

## Security

- Never return raw provider API tokens
- `configJson` must not allow arbitrary SSRF beyond adapter allowlists (Replicate host only in v1)
- Validate upload MIME/size like fake AI
- Rate-limit execute endpoints

## Testing

- Unit: milli convert round-trip; default uniqueness; reserve/capture with milli amounts
- Service: execute with mock Replicate adapter; failure releases credits
- Admin CRUD validation (3 decimal max)
- Migration smoke: sample balances ×1000
- Fake AI existing specs remain green

## Rollout

1. Millicredit migration + API serialization helpers  
2. Schema + admin CRUD for types/variants  
3. User list operations + execute with stub providers  
4. Replicate adapter + seed example variants (inactive until token set)  
5. Docs for frontend (fake vs real, decimal credits, variant selection)

## Frontend contract notes

- Test mode: keep calling fake endpoints  
- Prod: `GET operations` → show variants; default preselected; on error show other variants of same type  
- All credit UI: 3 decimal places  
- Do not upload canvas drop images to cloud (browser-only); unrelated but standing product rule

## Open points deferred

- Admin UI for storing Replicate token in DB vs env-only  
- Exact multipart field schema per type beyond current fake field defs  
- Whether purchase packages shown to users need copy changes after ×1000 migration
