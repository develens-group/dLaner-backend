-- AlterEnum
CREATE TYPE "AiCredentialStatus" AS ENUM ('ACTIVE', 'INVALID', 'REVOKED');

-- AlterEnum
CREATE TYPE "AiBillingMode" AS ENUM ('PLATFORM_CREDITS', 'USER_KEY');

-- AlterTable
ALTER TABLE "AiRequest" ADD COLUMN "credentialId" UUID,
ADD COLUMN "billingMode" "AiBillingMode" NOT NULL DEFAULT 'PLATFORM_CREDITS';

-- CreateTable
CREATE TABLE "UserAiCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "label" VARCHAR(100),
    "apiKeyEnc" TEXT NOT NULL,
    "keyHint" VARCHAR(32) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "AiCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAiCredential_userId_provider_idx" ON "UserAiCredential"("userId", "provider");

-- CreateIndex
CREATE INDEX "UserAiCredential_userId_isDefault_idx" ON "UserAiCredential"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "AiRequest_credentialId_idx" ON "AiRequest"("credentialId");

-- AddForeignKey
ALTER TABLE "UserAiCredential" ADD CONSTRAINT "UserAiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "UserAiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
