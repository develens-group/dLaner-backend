-- CreateTable
CREATE TABLE "SocialIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAuthAttempt" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "stateHash" VARCHAR(64) NOT NULL,
    "clientState" VARCHAR(128) NOT NULL,
    "codeChallenge" VARCHAR(43) NOT NULL,
    "providerVerifier" VARCHAR(128) NOT NULL,
    "linkUserId" UUID,
    "linkSessionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAuthGrant" (
    "id" UUID NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "codeChallenge" VARCHAR(43) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "emailTrusted" BOOLEAN NOT NULL,
    "displayName" VARCHAR(100),
    "linkUserId" UUID,
    "linkSessionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialIdentity_provider_providerAccountId_key" ON "SocialIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialIdentity_userId_provider_key" ON "SocialIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAuthAttempt_stateHash_key" ON "SocialAuthAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "SocialAuthAttempt_expiresAt_idx" ON "SocialAuthAttempt"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAuthGrant_codeHash_key" ON "SocialAuthGrant"("codeHash");

-- CreateIndex
CREATE INDEX "SocialAuthGrant_expiresAt_idx" ON "SocialAuthGrant"("expiresAt");

-- AddForeignKey
ALTER TABLE "SocialIdentity" ADD CONSTRAINT "SocialIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
