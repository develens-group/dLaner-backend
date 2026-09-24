-- AI operation catalog + millicredit scale migration
-- Credit Int columns keep type but values become millicredits (×1000).

CREATE TABLE "AiOperationType" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "description" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperationType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiOperationType_slug_key" ON "AiOperationType"("slug");
CREATE INDEX "AiOperationType_isActive_sortOrder_idx" ON "AiOperationType"("isActive", "sortOrder");

CREATE TABLE "AiProviderVariant" (
    "id" UUID NOT NULL,
    "typeId" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "externalModel" VARCHAR(255) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "creditCostMilli" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiProviderVariant_typeId_isActive_idx" ON "AiProviderVariant"("typeId", "isActive");
CREATE INDEX "AiProviderVariant_typeId_isDefault_idx" ON "AiProviderVariant"("typeId", "isDefault");
CREATE INDEX "AiProviderVariant_provider_idx" ON "AiProviderVariant"("provider");

ALTER TABLE "AiProviderVariant" ADD CONSTRAINT "AiProviderVariant_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AiOperationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiRequest" ADD COLUMN "variantId" UUID;
CREATE INDEX "AiRequest_variantId_idx" ON "AiRequest"("variantId");
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "AiProviderVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Scale existing credit balances and related amounts to millicredits
UPDATE "CreditAccount" SET
  "availableBalance" = "availableBalance" * 1000,
  "reservedBalance" = "reservedBalance" * 1000,
  "lifetimePurchased" = "lifetimePurchased" * 1000,
  "lifetimeConsumed" = "lifetimeConsumed" * 1000;

UPDATE "CreditLedgerEntry" SET
  "amount" = "amount" * 1000,
  "availableDelta" = "availableDelta" * 1000,
  "reservedDelta" = "reservedDelta" * 1000,
  "availableBalanceAfter" = "availableBalanceAfter" * 1000,
  "reservedBalanceAfter" = "reservedBalanceAfter" * 1000;

UPDATE "CreditReservation" SET
  "amount" = "amount" * 1000,
  "capturedAmount" = "capturedAmount" * 1000;

UPDATE "CreditPackage" SET
  "creditAmount" = "creditAmount" * 1000,
  "bonusCreditAmount" = "bonusCreditAmount" * 1000;

UPDATE "CreditPurchaseOrder" SET
  "creditAmount" = "creditAmount" * 1000,
  "bonusCreditAmount" = "bonusCreditAmount" * 1000,
  "totalCreditAmount" = "totalCreditAmount" * 1000;

UPDATE "AiRequest" SET
  "estimatedCreditCost" = "estimatedCreditCost" * 1000
  WHERE "estimatedCreditCost" IS NOT NULL;

UPDATE "AiRequest" SET
  "chargedCreditAmount" = "chargedCreditAmount" * 1000
  WHERE "chargedCreditAmount" IS NOT NULL;

UPDATE "AiRequest" SET
  "actualCreditCost" = "actualCreditCost" * 1000
  WHERE "actualCreditCost" IS NOT NULL;
