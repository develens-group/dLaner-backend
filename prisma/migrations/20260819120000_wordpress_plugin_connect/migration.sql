-- AlterEnum
CREATE TYPE "WordPressConnectionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- AlterEnum
CREATE TYPE "WordPressEditSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "WordPressConnectionRequest" (
    "id" UUID NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "siteName" VARCHAR(100),
    "installationKeyHash" VARCHAR(64) NOT NULL,
    "metadataJson" JSONB,
    "status" "WordPressConnectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID,
    "wordpressSiteId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordPressConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordPressEditSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "wordpressSiteId" UUID NOT NULL,
    "status" "WordPressEditSessionStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inputText" TEXT,
    "inputJson" JSONB,
    "outputText" TEXT,
    "outputJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WordPressEditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordPressEditAsset" (
    "id" UUID NOT NULL,
    "editSessionId" UUID NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "contentType" VARCHAR(128) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "originalName" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordPressEditAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WordPressConnectionRequest_status_expiresAt_idx" ON "WordPressConnectionRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "WordPressConnectionRequest_domain_status_idx" ON "WordPressConnectionRequest"("domain", "status");

-- CreateIndex
CREATE INDEX "WordPressEditSession_wordpressSiteId_status_createdAt_idx" ON "WordPressEditSession"("wordpressSiteId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WordPressEditSession_userId_status_createdAt_idx" ON "WordPressEditSession"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WordPressEditSession_expiresAt_idx" ON "WordPressEditSession"("expiresAt");

-- CreateIndex
CREATE INDEX "WordPressEditAsset_editSessionId_direction_createdAt_idx" ON "WordPressEditAsset"("editSessionId", "direction", "createdAt");

-- CreateIndex
CREATE INDEX "WordPressSite_domain_enabled_idx" ON "WordPressSite"("domain", "enabled");

-- AddForeignKey
ALTER TABLE "WordPressConnectionRequest" ADD CONSTRAINT "WordPressConnectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordPressConnectionRequest" ADD CONSTRAINT "WordPressConnectionRequest_wordpressSiteId_fkey" FOREIGN KEY ("wordpressSiteId") REFERENCES "WordPressSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordPressEditSession" ADD CONSTRAINT "WordPressEditSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordPressEditSession" ADD CONSTRAINT "WordPressEditSession_wordpressSiteId_fkey" FOREIGN KEY ("wordpressSiteId") REFERENCES "WordPressSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordPressEditAsset" ADD CONSTRAINT "WordPressEditAsset_editSessionId_fkey" FOREIGN KEY ("editSessionId") REFERENCES "WordPressEditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
