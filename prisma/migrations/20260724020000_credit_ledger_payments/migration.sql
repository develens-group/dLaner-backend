CREATE TYPE "CreditLedgerType" AS ENUM ('PURCHASE','ADMIN_GRANT','ADMIN_DEDUCTION','RESERVATION','RESERVATION_CAPTURE','RESERVATION_RELEASE','CONSUMPTION','REFUND','EXPIRATION','REVERSAL','PROMOTION');
CREATE TYPE "CreditReservationStatus" AS ENUM ('ACTIVE','CAPTURED','RELEASED','EXPIRED');
CREATE TYPE "CreditOrderStatus" AS ENUM ('CREATED','PENDING_PAYMENT','PAID','FAILED','CANCELLED','EXPIRED','REFUNDED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED','PENDING','SUCCEEDED','FAILED','CANCELLED');

ALTER TABLE "AiRequest" ALTER COLUMN "estimatedCreditCost" TYPE INTEGER USING ROUND("estimatedCreditCost")::INTEGER;
ALTER TABLE "AiRequest" ALTER COLUMN "chargedCreditAmount" TYPE INTEGER USING ROUND("chargedCreditAmount")::INTEGER;
ALTER TABLE "AiRequest" ADD COLUMN "creditReservationId" UUID;
ALTER TABLE "AiRequest" ADD COLUMN "actualCreditCost" INTEGER;
ALTER TABLE "AiRequest" ADD COLUMN "creditChargedAt" TIMESTAMP(3);
CREATE INDEX "AiRequest_creditReservationId_idx" ON "AiRequest"("creditReservationId");

CREATE TABLE "CreditAccount" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "availableBalance" INTEGER NOT NULL DEFAULT 0,
  "reservedBalance" INTEGER NOT NULL DEFAULT 0, "lifetimePurchased" INTEGER NOT NULL DEFAULT 0,
  "lifetimeConsumed" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditAccount_nonnegative" CHECK ("availableBalance" >= 0 AND "reservedBalance" >= 0 AND "lifetimePurchased" >= 0 AND "lifetimeConsumed" >= 0)
);
CREATE UNIQUE INDEX "CreditAccount_userId_key" ON "CreditAccount"("userId");
CREATE INDEX "CreditAccount_createdAt_idx" ON "CreditAccount"("createdAt");

CREATE TABLE "CreditLedgerEntry" (
  "id" UUID NOT NULL, "accountId" UUID NOT NULL, "userId" UUID NOT NULL, "type" "CreditLedgerType" NOT NULL,
  "amount" INTEGER NOT NULL, "availableDelta" INTEGER NOT NULL, "reservedDelta" INTEGER NOT NULL,
  "availableBalanceAfter" INTEGER NOT NULL, "reservedBalanceAfter" INTEGER NOT NULL,
  "referenceType" VARCHAR(100) NOT NULL, "referenceId" VARCHAR(255), "idempotencyKey" VARCHAR(128),
  "requestHash" VARCHAR(64), "description" VARCHAR(500), "metadataJson" JSONB, "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditLedgerEntry_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "CreditLedgerEntry_balances_nonnegative" CHECK ("availableBalanceAfter" >= 0 AND "reservedBalanceAfter" >= 0)
);
CREATE UNIQUE INDEX "CreditLedgerEntry_userId_type_idempotencyKey_key" ON "CreditLedgerEntry"("userId","type","idempotencyKey");
CREATE INDEX "CreditLedgerEntry_accountId_createdAt_idx" ON "CreditLedgerEntry"("accountId","createdAt");
CREATE INDEX "CreditLedgerEntry_userId_createdAt_idx" ON "CreditLedgerEntry"("userId","createdAt");
CREATE INDEX "CreditLedgerEntry_referenceType_referenceId_idx" ON "CreditLedgerEntry"("referenceType","referenceId");
CREATE INDEX "CreditLedgerEntry_createdAt_idx" ON "CreditLedgerEntry"("createdAt");

CREATE TABLE "CreditReservation" (
  "id" UUID NOT NULL, "accountId" UUID NOT NULL, "userId" UUID NOT NULL, "amount" INTEGER NOT NULL,
  "capturedAmount" INTEGER NOT NULL DEFAULT 0, "status" "CreditReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "referenceType" VARCHAR(100) NOT NULL, "referenceId" VARCHAR(255) NOT NULL, "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL, "expiresAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditReservation_amount_positive" CHECK ("amount" > 0 AND "capturedAmount" >= 0 AND "capturedAmount" <= "amount")
);
CREATE UNIQUE INDEX "CreditReservation_userId_idempotencyKey_key" ON "CreditReservation"("userId","idempotencyKey");
CREATE INDEX "CreditReservation_accountId_status_idx" ON "CreditReservation"("accountId","status");
CREATE INDEX "CreditReservation_userId_createdAt_idx" ON "CreditReservation"("userId","createdAt");
CREATE INDEX "CreditReservation_expiresAt_status_idx" ON "CreditReservation"("expiresAt","status");
CREATE INDEX "CreditReservation_referenceType_referenceId_idx" ON "CreditReservation"("referenceType","referenceId");

CREATE TABLE "CreditPackage" (
  "id" UUID NOT NULL, "name" VARCHAR(150) NOT NULL, "description" VARCHAR(1000), "creditAmount" INTEGER NOT NULL,
  "bonusCreditAmount" INTEGER NOT NULL DEFAULT 0, "priceMinor" INTEGER NOT NULL, "currency" VARCHAR(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "purchaseLimitPerUser" INTEGER,
  "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditPackage_amounts_valid" CHECK ("creditAmount" > 0 AND "bonusCreditAmount" >= 0 AND "priceMinor" >= 0)
);
CREATE INDEX "CreditPackage_isActive_sortOrder_idx" ON "CreditPackage"("isActive","sortOrder");
CREATE INDEX "CreditPackage_startsAt_endsAt_idx" ON "CreditPackage"("startsAt","endsAt");

CREATE TABLE "CreditPurchaseOrder" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "packageId" UUID NOT NULL, "status" "CreditOrderStatus" NOT NULL DEFAULT 'CREATED',
  "creditAmount" INTEGER NOT NULL, "bonusCreditAmount" INTEGER NOT NULL, "totalCreditAmount" INTEGER NOT NULL,
  "priceMinor" INTEGER NOT NULL, "currency" VARCHAR(3) NOT NULL, "paymentProvider" VARCHAR(100) NOT NULL,
  "providerPaymentId" VARCHAR(255), "idempotencyKey" VARCHAR(128) NOT NULL, "requestHash" VARCHAR(64) NOT NULL,
  "paidAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditPurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditPurchaseOrder_userId_idempotencyKey_key" ON "CreditPurchaseOrder"("userId","idempotencyKey");
CREATE INDEX "CreditPurchaseOrder_userId_createdAt_idx" ON "CreditPurchaseOrder"("userId","createdAt");
CREATE INDEX "CreditPurchaseOrder_status_createdAt_idx" ON "CreditPurchaseOrder"("status","createdAt");
CREATE INDEX "CreditPurchaseOrder_providerPaymentId_idx" ON "CreditPurchaseOrder"("providerPaymentId");

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL, "orderId" UUID NOT NULL, "provider" VARCHAR(100) NOT NULL, "providerPaymentId" VARCHAR(255),
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED', "amountMinor" INTEGER NOT NULL, "currency" VARCHAR(3) NOT NULL,
  "requestJson" JSONB, "responseJson" JSONB, "failureCode" VARCHAR(100), "failureMessage" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId","createdAt");
CREATE INDEX "PaymentAttempt_provider_providerPaymentId_idx" ON "PaymentAttempt"("provider","providerPaymentId");

CREATE TABLE "PaymentWebhookEvent" (
  "id" UUID NOT NULL, "provider" VARCHAR(100) NOT NULL, "providerEventId" VARCHAR(255) NOT NULL,
  "eventType" VARCHAR(100) NOT NULL, "signatureValid" BOOLEAN NOT NULL, "payloadHash" VARCHAR(64) NOT NULL,
  "payloadJson" JSONB, "processedAt" TIMESTAMP(3), "processingError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider","providerEventId");
CREATE INDEX "PaymentWebhookEvent_createdAt_idx" ON "PaymentWebhookEvent"("createdAt");
CREATE INDEX "PaymentWebhookEvent_processedAt_idx" ON "PaymentWebhookEvent"("processedAt");

ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditPackage" ADD CONSTRAINT "CreditPackage_noop" CHECK ("currency" = UPPER("currency"));
ALTER TABLE "CreditPurchaseOrder" ADD CONSTRAINT "CreditPurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditPurchaseOrder" ADD CONSTRAINT "CreditPurchaseOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CreditPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CreditPurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_creditReservationId_fkey" FOREIGN KEY ("creditReservationId") REFERENCES "CreditReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
