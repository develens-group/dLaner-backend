-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "encryptedSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthRequest" (
    "tokenHash" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthRequest_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "McpOAuthGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT NOT NULL,
    "siteIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthToken" (
    "tokenHash" VARCHAR(64) NOT NULL,
    "grantId" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "McpOAuthRequest_expiresAt_idx" ON "McpOAuthRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_userId_revokedAt_idx" ON "McpOAuthGrant"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "McpOAuthToken_grantId_idx" ON "McpOAuthToken"("grantId");

-- CreateIndex
CREATE INDEX "McpOAuthToken_expiresAt_idx" ON "McpOAuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthToken" ADD CONSTRAINT "McpOAuthToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "McpOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
