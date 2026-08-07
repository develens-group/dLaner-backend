CREATE TYPE "UserPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
ALTER TABLE "User" ADD COLUMN "plan" "UserPlan" NOT NULL DEFAULT 'FREE';
CREATE INDEX "User_plan_idx" ON "User"("plan");
