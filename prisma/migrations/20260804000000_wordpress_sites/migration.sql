CREATE TYPE "SessionClientType" AS ENUM ('WEB', 'WORDPRESS');

CREATE TABLE "WordPressSite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100),
    "domain" VARCHAR(253) NOT NULL,
    "installationKeyHash" VARCHAR(64) NOT NULL,
    "metadataJson" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastConnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WordPressSite_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Session" ADD COLUMN "clientType" "SessionClientType" NOT NULL DEFAULT 'WEB';
ALTER TABLE "Session" ADD COLUMN "wordpressSiteId" UUID;
CREATE UNIQUE INDEX "WordPressSite_userId_domain_key" ON "WordPressSite"("userId", "domain");
CREATE INDEX "WordPressSite_userId_enabled_createdAt_idx" ON "WordPressSite"("userId", "enabled", "createdAt");
CREATE INDEX "Session_wordpressSiteId_revokedAt_idx" ON "Session"("wordpressSiteId", "revokedAt");
ALTER TABLE "WordPressSite" ADD CONSTRAINT "WordPressSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_wordpressSiteId_fkey" FOREIGN KEY ("wordpressSiteId") REFERENCES "WordPressSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
