CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');

CREATE TABLE "SubscriptionPlan" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(1000),
  "userPlan" "UserPlan" NOT NULL,
  "interval" "SubscriptionInterval",
  "priceMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "storageBytesLimit" BIGINT NOT NULL,
  "includedCreditAmount" DECIMAL(36,18) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");
CREATE INDEX "SubscriptionPlan_isActive_sortOrder_idx" ON "SubscriptionPlan"("isActive", "sortOrder");

CREATE TABLE "UserSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "creditsGrantedForKey" VARCHAR(128),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");
CREATE INDEX "UserSubscription_planId_idx" ON "UserSubscription"("planId");
CREATE INDEX "UserSubscription_currentPeriodEnd_idx" ON "UserSubscription"("currentPeriodEnd");

CREATE TABLE "SubscriptionOrder" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "CreditOrderStatus" NOT NULL DEFAULT 'CREATED',
  "priceMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "paymentProvider" VARCHAR(100) NOT NULL,
  "providerPaymentId" VARCHAR(255),
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionOrder_userId_idempotencyKey_key" ON "SubscriptionOrder"("userId", "idempotencyKey");
CREATE INDEX "SubscriptionOrder_userId_createdAt_idx" ON "SubscriptionOrder"("userId", "createdAt");
CREATE INDEX "SubscriptionOrder_status_createdAt_idx" ON "SubscriptionOrder"("status", "createdAt");
CREATE INDEX "SubscriptionOrder_providerPaymentId_idx" ON "SubscriptionOrder"("providerPaymentId");

CREATE TABLE "SubscriptionPaymentAttempt" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "provider" VARCHAR(100) NOT NULL,
  "providerPaymentId" VARCHAR(255),
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "amountMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "responseJson" JSONB,
  "failureCode" VARCHAR(100),
  "failureMessage" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionPaymentAttempt_orderId_createdAt_idx" ON "SubscriptionPaymentAttempt"("orderId", "createdAt");
CREATE INDEX "SubscriptionPaymentAttempt_provider_providerPaymentId_idx" ON "SubscriptionPaymentAttempt"("provider", "providerPaymentId");

ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPaymentAttempt" ADD CONSTRAINT "SubscriptionPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SubscriptionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: Free + Creator + Studio (monthly/yearly). Amounts in USD minor units.
INSERT INTO "SubscriptionPlan" ("id","slug","name","description","userPlan","interval","priceMinor","currency","storageBytesLimit","includedCreditAmount","isActive","sortOrder","createdAt","updatedAt") VALUES
  ('a1000000-0000-4000-8000-000000000001','free','Free','Starter workspace for exploring dLander','FREE',NULL,0,'USD',209715200,10,true,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000002','creator-monthly','Creator','For freelancers shipping Lands regularly','PRO','MONTHLY',1200,'USD',5368709120,50,true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000003','creator-yearly','Creator','Creator billed yearly (2 months free)','PRO','YEARLY',9900,'USD',5368709120,600,true,11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000004','studio-monthly','Studio','Teams and heavy AI + storage use','ENTERPRISE','MONTHLY',3900,'USD',53687091200,200,true,20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000005','studio-yearly','Studio','Studio billed yearly (2 months free)','ENTERPRISE','YEARLY',34900,'USD',53687091200,2400,true,21,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
