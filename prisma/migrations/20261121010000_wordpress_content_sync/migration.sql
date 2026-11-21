-- AlterTable
ALTER TABLE "WordPressSite" ADD COLUMN     "contentSnapshotId" UUID;

-- CreateTable
CREATE TABLE "WordPressContentSnapshot" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'UPLOADING',
    "expectedItems" INTEGER NOT NULL,
    "includeUnpublished" BOOLEAN NOT NULL DEFAULT false,
    "siteInfo" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordPressContentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordPressContentItem" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "payload" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "WordPressContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WordPressContentSnapshot_siteId_status_createdAt_idx" ON "WordPressContentSnapshot"("siteId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WordPressContentSnapshot_status_expiresAt_idx" ON "WordPressContentSnapshot"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "WordPressContentItem_snapshotId_kind_idx" ON "WordPressContentItem"("snapshotId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WordPressContentItem_snapshotId_kind_externalId_key" ON "WordPressContentItem"("snapshotId", "kind", "externalId");

-- AddForeignKey
ALTER TABLE "WordPressContentSnapshot" ADD CONSTRAINT "WordPressContentSnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WordPressSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordPressContentItem" ADD CONSTRAINT "WordPressContentItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "WordPressContentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
