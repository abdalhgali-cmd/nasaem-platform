-- Platform 3.0 Phase 3: extend Service with admin-configurable display
-- metadata (sortOrder/iconKey/imageKey/features).
--
-- `prisma migrate dev` also proposed dropping flight_bank_accounts,
-- flight_bookings and flight_inventory (and their FKs) because those
-- tables are managed by raw SQL with no Prisma model — this is the same
-- recurring false-positive documented in docs/PLATFORM-3-AUDIT.md and
-- handled the same way every time: those DROP statements were removed by
-- hand. Only the additive Service changes below are real.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "features" JSONB,
ADD COLUMN     "iconKey" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Service_sortOrder_idx" ON "Service"("sortOrder");
