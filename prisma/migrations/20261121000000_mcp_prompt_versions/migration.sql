CREATE TABLE "McpPromptVersion" (
 "id" SERIAL NOT NULL,
 "fileName" VARCHAR(200) NOT NULL,
 "content" TEXT NOT NULL,
 "contentHash" VARCHAR(64) NOT NULL,
 "sizeBytes" INTEGER NOT NULL,
 "createdById" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "McpPromptVersion_pkey" PRIMARY KEY ("id")
);
