CREATE TABLE "LoginProtection" (
    "scopeHash" VARCHAR(64) NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginProtection_pkey" PRIMARY KEY ("scopeHash")
);

CREATE TABLE "CaptchaChallenge" (
    "id" UUID NOT NULL,
    "scopeHash" VARCHAR(64) NOT NULL,
    "answerHash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaptchaChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaptchaChallenge_scopeHash_expiresAt_idx" ON "CaptchaChallenge"("scopeHash", "expiresAt");
CREATE INDEX "CaptchaChallenge_expiresAt_idx" ON "CaptchaChallenge"("expiresAt");
