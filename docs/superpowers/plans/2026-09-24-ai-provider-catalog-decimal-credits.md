# AI Provider Catalog + Millicredits Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Steps use checkbox syntax.

**Goal:** DB-backed AI operation types/variants with admin CRUD, user execute via default or variantId, Replicate adapter in v1, millicredit (×1000) storage with 3-decimal API, fake AI unchanged.

**Architecture:** Add `credit-units.ts` for milli ↔ decimal. Migrate all credit Int values ×1000. New Prisma models `AiOperationType` + `AiProviderVariant`. Admin controllers under `/api/v1/admin/ai`. User `GET /ai/operations` + `POST /ai/execute`. Provider registry gains image adapters; Replicate fully implemented.

**Tech Stack:** NestJS, Prisma, existing CreditService / AiRequest patterns.

**Spec:** `docs/superpowers/specs/2026-09-24-ai-provider-catalog-decimal-credits-design.md`

## Global Constraints

- Millicredits: store Int; API 3 decimal places (`0.002` → `2`)
- Fake `/api/v1/ai/fake` behavior unchanged
- No server auto-failover; frontend retries with another variant
- v1: Replicate implemented; other image providers stub
- No custom HTTP admin adapters in v1

## File map

| File | Responsibility |
|------|----------------|
| `src/credits/credit-units.ts` | toMilli / fromMilli / parseDecimalCredits |
| `prisma/schema.prisma` | AiOperationType, AiProviderVariant; credit comments |
| `prisma/migrations/...` | tables + data ×1000 |
| `src/ai/ai-operations.catalog.ts` | service CRUD + resolve variant |
| `src/ai/admin-ai-catalog.controller.ts` | admin HTTP |
| `src/ai/ai-operations.controller.ts` | user list + execute |
| `src/ai/ai-operations.execute.service.ts` | reserve → provider → capture/release |
| `src/ai/providers/replicate.image.provider.ts` | Replicate predictions |
| `src/credits/*.ts` | serialize balances as decimal in API responses |

---

### Task 1: Millicredit helpers

**Files:**
- Create: `src/credits/credit-units.ts`
- Create: `src/credits/credit-units.spec.ts`

- [x] Write failing tests for toMilli/fromMilli/reject >3 decimals
- [x] Implement helpers
- [x] Run tests green

### Task 2: Prisma models + ×1000 migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration SQL

- [x] Add AiOperationType, AiProviderVariant
- [x] Add variantId optional on AiRequest if clean
- [x] Data migration UPDATE … SET balance = balance * 1000 for credit tables
- [x] `npx prisma generate`

### Task 3: Wire decimal serialization in credit APIs

- [x] Grant/package inputs accept decimal → milli
- [x] Balance endpoints return decimal

### Task 4: Catalog service + admin CRUD

- [x] Create catalog service, DTOs, admin controller
- [x] Register in ai.module

### Task 5: User operations list + execute (stub provider)

- [x] Controller + execute service

### Task 6: Replicate image adapter

- [x] `replicate.image.provider.ts` + config `REPLICATE_API_TOKEN`

### Task 7: Docs

- [x] Update docs with frontend contract
