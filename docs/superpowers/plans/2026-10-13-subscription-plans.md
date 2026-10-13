# Subscription plans implementation plan

## Delivered

1. Prisma models: `SubscriptionPlan`, `UserSubscription`, `SubscriptionOrder`, `SubscriptionPaymentAttempt`
2. Seeded plans: Free / Creator / Studio (monthly + yearly)
3. APIs: `GET /billing/plans`, `GET /billing/me`, `POST /billing/orders`, `POST .../start-payment`
4. Storage quota from land revisions; enforced on land save
5. Included credits via `PROMOTION` ledger (free starter + per paid period)
6. Webhook router: subscription first, then credit packages
7. FE: `/billing` page + Home plan/storage bar

## Verify

```bash
# backend
npx prisma migrate deploy
npm test -- --testPathPatterns="billing|subscription" --runInBand

# frontend
yarn vitest run excalidraw-app/pages/HomePage.test.tsx excalidraw-app/pages/billing/formatBytes.test.ts
```
