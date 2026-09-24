-- Move credit amounts from millicredit integers to DECIMAL credits (up to 18 places).
-- Prior migration stored amounts ×1000; divide back to real credit units.

ALTER TABLE "AiProviderVariant" RENAME COLUMN "creditCostMilli" TO "creditCost";
ALTER TABLE "AiProviderVariant"
  ALTER COLUMN "creditCost" TYPE DECIMAL(36,18)
  USING (("creditCost"::numeric) / 1000);

ALTER TABLE "CreditAccount"
  ALTER COLUMN "availableBalance" TYPE DECIMAL(36,18) USING (("availableBalance"::numeric) / 1000),
  ALTER COLUMN "reservedBalance" TYPE DECIMAL(36,18) USING (("reservedBalance"::numeric) / 1000),
  ALTER COLUMN "lifetimePurchased" TYPE DECIMAL(36,18) USING (("lifetimePurchased"::numeric) / 1000),
  ALTER COLUMN "lifetimeConsumed" TYPE DECIMAL(36,18) USING (("lifetimeConsumed"::numeric) / 1000);

ALTER TABLE "CreditLedgerEntry"
  ALTER COLUMN "amount" TYPE DECIMAL(36,18) USING (("amount"::numeric) / 1000),
  ALTER COLUMN "availableDelta" TYPE DECIMAL(36,18) USING (("availableDelta"::numeric) / 1000),
  ALTER COLUMN "reservedDelta" TYPE DECIMAL(36,18) USING (("reservedDelta"::numeric) / 1000),
  ALTER COLUMN "availableBalanceAfter" TYPE DECIMAL(36,18) USING (("availableBalanceAfter"::numeric) / 1000),
  ALTER COLUMN "reservedBalanceAfter" TYPE DECIMAL(36,18) USING (("reservedBalanceAfter"::numeric) / 1000);

ALTER TABLE "CreditReservation"
  ALTER COLUMN "amount" TYPE DECIMAL(36,18) USING (("amount"::numeric) / 1000),
  ALTER COLUMN "capturedAmount" TYPE DECIMAL(36,18) USING (("capturedAmount"::numeric) / 1000);

ALTER TABLE "CreditPackage"
  ALTER COLUMN "creditAmount" TYPE DECIMAL(36,18) USING (("creditAmount"::numeric) / 1000),
  ALTER COLUMN "bonusCreditAmount" TYPE DECIMAL(36,18) USING (("bonusCreditAmount"::numeric) / 1000);

ALTER TABLE "CreditPurchaseOrder"
  ALTER COLUMN "creditAmount" TYPE DECIMAL(36,18) USING (("creditAmount"::numeric) / 1000),
  ALTER COLUMN "bonusCreditAmount" TYPE DECIMAL(36,18) USING (("bonusCreditAmount"::numeric) / 1000),
  ALTER COLUMN "totalCreditAmount" TYPE DECIMAL(36,18) USING (("totalCreditAmount"::numeric) / 1000);

ALTER TABLE "AiRequest"
  ALTER COLUMN "estimatedCreditCost" TYPE DECIMAL(36,18) USING (
    CASE WHEN "estimatedCreditCost" IS NULL THEN NULL ELSE ("estimatedCreditCost"::numeric) / 1000 END
  ),
  ALTER COLUMN "chargedCreditAmount" TYPE DECIMAL(36,18) USING (
    CASE WHEN "chargedCreditAmount" IS NULL THEN NULL ELSE ("chargedCreditAmount"::numeric) / 1000 END
  ),
  ALTER COLUMN "actualCreditCost" TYPE DECIMAL(36,18) USING (
    CASE WHEN "actualCreditCost" IS NULL THEN NULL ELSE ("actualCreditCost"::numeric) / 1000 END
  );
