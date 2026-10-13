-- Staff session revocation (additive; no existing row is modified).
-- Existing tokens have no `sv` claim and are treated as sessionVersion 0,
-- which every existing user has after this migration, so nobody is signed out.
-- Rollback: DROP TABLE "RevokedStaffToken";
--           ALTER TABLE "User" DROP COLUMN "sessionVersion";
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RevokedStaffToken" (
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedStaffToken_pkey" PRIMARY KEY ("tokenId")
);

CREATE INDEX "RevokedStaffToken_userId_idx" ON "RevokedStaffToken"("userId");
CREATE INDEX "RevokedStaffToken_expiresAt_idx" ON "RevokedStaffToken"("expiresAt");

ALTER TABLE "RevokedStaffToken"
ADD CONSTRAINT "RevokedStaffToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
