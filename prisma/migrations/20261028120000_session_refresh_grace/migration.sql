-- Rotation grace window: remember the previous refresh token hash for a short
-- period so concurrent refreshes from multiple tabs are not treated as reuse.
ALTER TABLE "Session"
    ADD COLUMN "prevRefreshTokenHash" TEXT,
    ADD COLUMN "prevRefreshTokenAt" TIMESTAMP(3);
