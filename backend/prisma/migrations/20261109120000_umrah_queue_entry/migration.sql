-- Additive and rebuildable: a derived ordering cache for the Umrah staff queue.
-- Nothing is backfilled here (no data is inferred inside a migration); rows are
-- created as requests change and by backend/src/scripts/rebuild-umrah-queue.js
-- (dry run by default). Rollback: DROP TABLE "UmrahQueueEntry" (loses nothing).
CREATE TABLE "UmrahQueueEntry" (
    "contactRequestId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "packageKind" TEXT NOT NULL,
    "preferredTravelDate" TEXT,
    "requestCreatedAt" TIMESTAMP(3) NOT NULL,
    "derivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UmrahQueueEntry_pkey" PRIMARY KEY ("contactRequestId")
);
CREATE INDEX "UmrahQueueEntry_organizationId_rank_preferredTravelDate_requestCreatedAt_idx" ON "UmrahQueueEntry"("organizationId", "rank", "preferredTravelDate", "requestCreatedAt");
CREATE INDEX "UmrahQueueEntry_organizationId_preferredTravelDate_rank_requestCreatedAt_idx" ON "UmrahQueueEntry"("organizationId", "preferredTravelDate", "rank", "requestCreatedAt");
CREATE INDEX "UmrahQueueEntry_organizationId_stage_idx" ON "UmrahQueueEntry"("organizationId", "stage");
CREATE INDEX "UmrahQueueEntry_derivedAt_idx" ON "UmrahQueueEntry"("derivedAt");
ALTER TABLE "UmrahQueueEntry" ADD CONSTRAINT "UmrahQueueEntry_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
