CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'DELETED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" VARCHAR(100),
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "emailVerifiedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

CREATE TABLE "Session" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "userAgent" VARCHAR(512),
  "ipAddress" VARCHAR(64),
  "deviceName" VARCHAR(100),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "EmailVerificationToken" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_usedAt_idx" ON "EmailVerificationToken"("userId", "usedAt");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_usedAt_idx" ON "PasswordResetToken"("userId", "usedAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
