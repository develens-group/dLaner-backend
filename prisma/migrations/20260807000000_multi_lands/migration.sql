CREATE TABLE "Land" (
  "id" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "title" VARCHAR(150) NOT NULL,
  "currentRevisionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Land_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LandRevision" (
  "id" UUID NOT NULL,
  "landId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LandRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Land_currentRevisionId_key" ON "Land"("currentRevisionId");
CREATE INDEX "Land_ownerId_deletedAt_updatedAt_idx" ON "Land"("ownerId", "deletedAt", "updatedAt");
CREATE UNIQUE INDEX "LandRevision_storageKey_key" ON "LandRevision"("storageKey");
CREATE UNIQUE INDEX "LandRevision_landId_revision_key" ON "LandRevision"("landId", "revision");
CREATE INDEX "LandRevision_landId_createdAt_idx" ON "LandRevision"("landId", "createdAt");
ALTER TABLE "Land" ADD CONSTRAINT "Land_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LandRevision" ADD CONSTRAINT "LandRevision_landId_fkey" FOREIGN KEY ("landId") REFERENCES "Land"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LandRevision" ADD CONSTRAINT "LandRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Land" ADD CONSTRAINT "Land_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "LandRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
