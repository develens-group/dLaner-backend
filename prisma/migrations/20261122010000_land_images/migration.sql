-- CreateTable
CREATE TABLE "LandImage" (
    "id" UUID NOT NULL,
    "landId" UUID NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "previewStorageKey" VARCHAR(500),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandImage_storageKey_key" ON "LandImage"("storageKey");

-- CreateIndex
CREATE INDEX "LandImage_landId_createdAt_idx" ON "LandImage"("landId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandImage_landId_contentHash_key" ON "LandImage"("landId", "contentHash");

-- AddForeignKey
ALTER TABLE "LandImage" ADD CONSTRAINT "LandImage_landId_fkey" FOREIGN KEY ("landId") REFERENCES "Land"("id") ON DELETE CASCADE ON UPDATE CASCADE;
