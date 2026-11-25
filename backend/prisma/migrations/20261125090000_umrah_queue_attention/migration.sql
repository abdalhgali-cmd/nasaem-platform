-- Additive only: manager attention facts on the rebuildable Umrah queue cache.
-- Existing rows keep waitingOn NULL and are re-derived by the list on first use.
ALTER TABLE "UmrahQueueEntry" ADD COLUMN "waitingOn" TEXT;
ALTER TABLE "UmrahQueueEntry" ADD COLUMN "partialVisas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UmrahQueueEntry" ADD COLUMN "delayedVisa" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "UmrahQueueEntry_organizationId_waitingOn_idx" ON "UmrahQueueEntry"("organizationId", "waitingOn");
