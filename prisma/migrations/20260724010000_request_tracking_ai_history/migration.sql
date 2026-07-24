CREATE TYPE "ApiRequestSource" AS ENUM ('WEB', 'MOBILE', 'ADMIN', 'INTERNAL', 'WEBHOOK', 'UNKNOWN');
CREATE TYPE "AiRequestStatus" AS ENUM ('CREATED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AiOperation" AS ENUM ('CHAT', 'TEXT_GENERATION', 'IMAGE_GENERATION', 'EMBEDDING', 'TRANSCRIPTION', 'CUSTOM');

CREATE TABLE "ApiRequestRecord" (
  "id" UUID NOT NULL, "requestId" VARCHAR(128) NOT NULL, "userId" UUID, "sessionId" UUID,
  "method" VARCHAR(16) NOT NULL, "route" VARCHAR(512) NOT NULL, "path" VARCHAR(2048) NOT NULL,
  "queryJson" JSONB, "requestBodyJson" JSONB, "responseSummaryJson" JSONB,
  "bodyCaptured" BOOLEAN NOT NULL DEFAULT false, "bodyTruncated" BOOLEAN NOT NULL DEFAULT false,
  "bodyRedacted" BOOLEAN NOT NULL DEFAULT false, "statusCode" INTEGER NOT NULL, "durationMs" INTEGER NOT NULL,
  "ipAddress" VARCHAR(64), "userAgent" VARCHAR(512), "contentLength" INTEGER, "responseLength" INTEGER,
  "errorCode" VARCHAR(100), "errorMessage" VARCHAR(500), "source" "ApiRequestSource" NOT NULL DEFAULT 'UNKNOWN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ApiRequestRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiRequestRecord_requestId_key" ON "ApiRequestRecord"("requestId");
CREATE INDEX "ApiRequestRecord_userId_createdAt_idx" ON "ApiRequestRecord"("userId", "createdAt");
CREATE INDEX "ApiRequestRecord_route_createdAt_idx" ON "ApiRequestRecord"("route", "createdAt");
CREATE INDEX "ApiRequestRecord_statusCode_createdAt_idx" ON "ApiRequestRecord"("statusCode", "createdAt");
CREATE INDEX "ApiRequestRecord_createdAt_idx" ON "ApiRequestRecord"("createdAt");
CREATE INDEX "ApiRequestRecord_errorCode_createdAt_idx" ON "ApiRequestRecord"("errorCode", "createdAt");

CREATE TABLE "AiRequest" (
  "id" UUID NOT NULL, "requestId" VARCHAR(128), "userId" UUID NOT NULL, "idempotencyKey" VARCHAR(128),
  "provider" VARCHAR(100) NOT NULL, "model" VARCHAR(100) NOT NULL, "operation" "AiOperation" NOT NULL,
  "status" "AiRequestStatus" NOT NULL DEFAULT 'CREATED', "inputJson" JSONB, "inputHash" VARCHAR(64) NOT NULL,
  "inputOmitted" BOOLEAN NOT NULL DEFAULT false, "inputTruncated" BOOLEAN NOT NULL DEFAULT false,
  "inputRedacted" BOOLEAN NOT NULL DEFAULT false, "outputJson" JSONB, "outputOmitted" BOOLEAN NOT NULL DEFAULT false,
  "outputTruncated" BOOLEAN NOT NULL DEFAULT false, "outputRedacted" BOOLEAN NOT NULL DEFAULT false,
  "providerRequestId" VARCHAR(255), "promptTokens" INTEGER, "completionTokens" INTEGER, "totalTokens" INTEGER,
  "estimatedCreditCost" DECIMAL(18,6), "chargedCreditAmount" DECIMAL(18,6), "latencyMs" INTEGER,
  "errorCode" VARCHAR(100), "errorMessage" VARCHAR(500), "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiRequest_userId_idempotencyKey_key" ON "AiRequest"("userId", "idempotencyKey");
CREATE INDEX "AiRequest_userId_createdAt_idx" ON "AiRequest"("userId", "createdAt");
CREATE INDEX "AiRequest_status_createdAt_idx" ON "AiRequest"("status", "createdAt");
CREATE INDEX "AiRequest_provider_model_createdAt_idx" ON "AiRequest"("provider", "model", "createdAt");
CREATE INDEX "AiRequest_requestId_idx" ON "AiRequest"("requestId");

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL, "action" VARCHAR(150) NOT NULL, "actorId" UUID, "targetType" VARCHAR(100) NOT NULL,
  "targetId" VARCHAR(255), "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "ApiRequestRecord" ADD CONSTRAINT "ApiRequestRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
