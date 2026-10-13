# Subscription plans + storage quota

## Goal

Paid monthly/yearly subscriptions separate from credit packages. Each paid period grants a small included credit allowance for testing platform AI. Storage quota per plan, shown on Home.

## Plans (few)

| Slug | Product | Interval | Storage | Included credits / period | Maps to `UserPlan` |
|------|---------|----------|---------|---------------------------|--------------------|
| `free` | Free | — | 200 MB | 10 once at entitlement sync | FREE |
| `creator-monthly` | Creator | MONTHLY | 5 GB | 50 | PRO |
| `creator-yearly` | Creator | YEARLY | 5 GB | 600 | PRO |
| `studio-monthly` | Studio | MONTHLY | 50 GB | 200 | ENTERPRISE |
| `studio-yearly` | Studio | YEARLY | 50 GB | 2400 | ENTERPRISE |

Credits packages remain buyable separately. Subscription included credits use ledger type `PROMOTION` with idempotency per period.

## Data

- `SubscriptionPlan` catalog (seeded)
- `UserSubscription` current entitlement (`ACTIVE` / `CANCELED` / `EXPIRED`)
- `SubscriptionOrder` + `SubscriptionPaymentAttempt` (parallel to credits commerce; mock provider)

## APIs

- `GET /api/v1/billing/plans`
- `GET /api/v1/billing/me` → plan, subscription, storage `{ usedBytes, limitBytes }`, credits balance summary
- `POST /api/v1/billing/orders` + `.../start-payment` + webhook fulfill
- Storage usage = sum of retained `LandRevision.sizeBytes` for owner’s non-deleted lands
- Enforce quota on land save (403/413 when new size would exceed limit)

## FE

- Home: plan chip + storage used/limit bar + link to Billing
- `/billing`: plan cards, monthly/yearly toggle, subscribe (mock payment)
- Keep `/credits/purchase` separate

## Flags

- `SUBSCRIPTION_PURCHASE_ENABLED` (default true in dev with mock)
