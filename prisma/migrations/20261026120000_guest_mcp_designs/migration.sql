CREATE TABLE "McpDesign" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpDesign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpDesign_tokenHash_key" ON "McpDesign"("tokenHash");
CREATE INDEX "McpDesign_expiresAt_idx" ON "McpDesign"("expiresAt");
